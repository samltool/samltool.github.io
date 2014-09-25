(function () {
  var x2js = new X2JS();
  var samlDecoded;

  // Taken from http://stackoverflow.com/questions/2490825/how-to-trigger-event-in-javascript
  function fireEvent(element) {
    var event; // The custom event that will be created

    if (document.createEvent) {
      event = document.createEvent('HTMLEvents');
      event.initEvent('change', true, true);
    } else {
      event = document.createEventObject();
      event.eventType = 'change';
    }

    event.eventName = 'change';

    if (document.createEvent) {
      element.dispatchEvent(event);
    } else {
      element.fireEvent('on' + event.eventType, event);
    }
  }

  var source   = $("#saml-info-template").html();
  var template = Handlebars.compile(source);

  function tabHack(instance) {
    instance.replaceSelection('   ' , 'end');
  }

function formatXml(xml) {
  return xml;
    var formatted = '';
    var reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    var pad = 0;
    jQuery.each(xml.split('\r\n'), function(index, node) {
        var indent = 0;
        if (node.match( /.+<\/\w[^>]*>$/ )) {
            indent = 0;
        } else if (node.match( /^<\/\w/ )) {
            if (pad != 0) {
                pad -= 1;
            }
        } else if (node.match( /^<\w[^>]*[^\/]>.*$/ )) {
            indent = 1;
        } else {
            indent = 0;
        }
 
        var padding = '';
        for (var i = 0; i < pad; i++) {
            padding += '  ';
        }
 
        formatted += padding + node + '\r\n';
        pad += indent;
    });
 
    return formatted;
}

  var tokenEditor = $('.token-input');

  var xmlEditor = CodeMirror(document.getElementsByClassName('xml-input')[0], {
    mode: 'text/html',
    // theme: 'night', 
    htmlMode: false,
    autofocus: true,
    lineNumbers: true,
    extraKeys: { 'Tab': tabHack},
  });

  function autoFormat() {
      // var totalLines = 100000;
      // var totalChars = 100000;
      // xmlEditor.autoFormatRange({line:0, ch:0}, {line:totalLines, ch:totalChars});
  }

  // window.autoFormat = autoFormat;

  function saveToStorage(jwt) {
    // Save last valid jwt value for refresh
    localStorage.jwtValue = jwt;
  }

  function loadFromStorage(cb) {
    cb(localStorage.jwtValue);
    localStorage.clear();
  }

  function isArray(obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  }

  function parseSaml() {

    if (!samlDecoded) {
      return;
    }

    var samlObj = x2js.xml_str2json(samlDecoded);

    if (!samlObj) { return; }

    if (!samlObj.Response) { return; }

    if (!samlObj.Response.Assertion) { return; }

    samlObj = samlObj.Response;
    console.log(samlObj);
    var samlData = {};

    var version;

    if (samlObj.Assertion._Version) {
      version = samlObj.Assertion._Version;
    } else if (samlObj.Assertion._MajorVersion) {
      version = samlObj.Assertion._MajorVersion;
    }

    samlData.version = version;

    if (version === '2.0') {
      if (samlObj.Issuer) {
        if (samlObj.Issuer.__text) {
          samlData.issuer = samlObj.Issuer.__text;
        }
      }
    } else if (samlObj.Assertion.Conditions) {
      if (samlObj.Assertion.Conditions._Issuer) {
        version = samlObj.Assertion.Conditions._Issuer;
      }
    }

    if (samlObj.Assertion.Conditions) {
      var date = samlObj.Assertion.Conditions._NotOnOrAfter;
      if (date) {
        var now = new Date();

        dateExpires = new Date(date);

        jQuery.timeago.settings.allowFuture = true;
        samlData.expires = jQuery.timeago(dateExpires);

        if (dateExpires < now) {
          samlData.expired = 'expired';
        }
      }

      if (version === '2.0') {
        if (samlObj.Assertion.Conditions.AudienceRestriction) {
            if (samlObj.Assertion.Conditions.AudienceRestriction.Audience) {
                var audience = samlObj.Assertion.Conditions.AudienceRestriction.Audience.__text;

                if (audience) {
                  samlData.audience = audience;
                }
            }
        }
      } else if (samlObj.Assertion.Conditions.AudienceRestrictionCondition) {
        if (samlObj.Assertion.Conditions.AudienceRestrictionCondition.Audience) {
          var audience = samlObj.Assertion.Conditions.AudienceRestrictionCondition.Audience.__text;

          if (audience) {
            samlData.audience = audience;
          }
        }
      }
    }

    if (samlObj.Signature) {
      if (samlObj.Signature.KeyInfo) {
        if (samlObj.Signature.KeyInfo.X509Data) {
          if (samlObj.Signature.KeyInfo.X509Data.X509Certificate) {
            var public_key = samlObj.Signature.KeyInfo.X509Data.X509Certificate;
            
            if (public_key) {
              public_key = public_key.replace(/(\r\n|\n|\r)/gm,"");
              var shaObj = new jsSHA(public_key, "B64");
              samlData.thumbprint = shaObj.getHash("SHA-1", "HEX");
            }
          }
        }
      }
    }

    if (samlObj.Assertion.AttributeStatement) {
      if (samlObj.Assertion.AttributeStatement.Attribute) {
        var attributes = samlObj.Assertion.AttributeStatement.Attribute;
        var attr = {};
        var values;

        if (!isArray(attributes)) {
          attr[getAttributeName(attributes)] = getValues(attributes.AttributeValue);
        } else {
          for (var i = attributes.length - 1; i >= 0; i--) {
            var values = attributes[i].AttributeValue;
            attr[getAttributeName(attributes[i])] = getValues(attributes[i].AttributeValue);
          };
        }

        samlData.attributes = attr;
        console.log(JSON.stringify(samlData.attributes));
      }
    }

    console.log(samlData);
    return samlData;
  }

  function getValues(values) {
    if (!isArray(values)) {
      val = [values.__text];
    } else {
      val = [];
      for (var j = values.length - 1; j >= 0; j--) {
        val.push(values[j].__text);
      };
    }
    return val;
  }

  function getAttributeName(attribute) {
    var name;

    if (attribute._FriendlyName) {
      name = attribute._FriendlyName;
    } else {
      name = attribute._Name;
    }

    return name;
  }

  $('.prettify').on('change', function() {
    if (!$(this).is(':checked')) {
      xmlEditor.setOption("readOnly", false);

      xmlEditor.setValue(samlDecoded);
      xmlEditor.focus();
    } else {
      xmlEditor.setValue(vkbeautify.xml(samlDecoded));
      xmlEditor.setOption("readOnly", true);
    }
  });

  tokenEditor.on('change keypress paste textInput input', function() {
    samlDecoded = window.decode($(this).val()).result;

    if (!samlDecoded) {
      return;
    }

    xmlEditor.setValue(samlDecoded);

    var data = parseSaml(samlDecoded);
    $(".saml-info").html(template(data));
  });

  xmlEditor.on('change', function(cm) {
    if ($('.prettify').is(':checked')) {
      return;
    }
    samlDecoded = xmlEditor.getValue();
    var encoded = window.encode(samlDecoded);
    tokenEditor.val(encoded);
    saveToStorage(encoded);
    var data = parseSaml(samlDecoded);
    $(".saml-info").html(template(data));
  });

  loadFromStorage(function (jwt) {
    tokenEditor.val(jwt || 'PHNhbWxwOlJlc3BvbnNlCiAgICB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIgogICAgeG1sbnM6c2FtbD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmFzc2VydGlvbiIKICAgIElEPSJpZGVudGlmaWVyXzIiCiAgICBJblJlc3BvbnNlVG89ImlkZW50aWZpZXJfMSIKICAgIFZlcnNpb249IjIuMCIKICAgIElzc3VlSW5zdGFudD0iMjAwNC0xMi0wNVQwOToyMjowNSIKICAgIERlc3RpbmF0aW9uPSJodHRwczovL3NwLmV4YW1wbGUuY29tL1NBTUwyL1NTTy9QT1NUIj4KICAgIDxzYW1sOklzc3Vlcj5odHRwczovL2lkcC5leGFtcGxlLm9yZy9TQU1MMjwvc2FtbDpJc3N1ZXI+CiAgICA8c2FtbHA6U3RhdHVzPgogICAgICA8c2FtbHA6U3RhdHVzQ29kZQogICAgICAgIFZhbHVlPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6c3RhdHVzOlN1Y2Nlc3MiLz4KICAgIDwvc2FtbHA6U3RhdHVzPgogICAgPHNhbWw6QXNzZXJ0aW9uCiAgICAgIHhtbG5zOnNhbWw9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphc3NlcnRpb24iCiAgICAgIElEPSJpZGVudGlmaWVyXzMiCiAgICAgIFZlcnNpb249IjIuMCIKICAgICAgSXNzdWVJbnN0YW50PSIyMDA0LTEyLTA1VDA5OjIyOjA1Ij4KICAgICAgPHNhbWw6SXNzdWVyPmh0dHBzOi8vaWRwLmV4YW1wbGUub3JnL1NBTUwyPC9zYW1sOklzc3Vlcj4KICAgICAgPCEtLSBhIFBPU1RlZCBhc3NlcnRpb24gTVVTVCBiZSBzaWduZWQgLS0+CiAgICAgIDxkczpTaWduYXR1cmUKICAgICAgICB4bWxuczpkcz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnIyI+Li4uPC9kczpTaWduYXR1cmU+CiAgICAgIDxzYW1sOlN1YmplY3Q+CiAgICAgICAgPHNhbWw6TmFtZUlECiAgICAgICAgICBGb3JtYXQ9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpuYW1laWQtZm9ybWF0OnRyYW5zaWVudCI+CiAgICAgICAgICAzZjdiM2RjZi0xNjc0LTRlY2QtOTJjOC0xNTQ0ZjM0NmJhZjgKICAgICAgICA8L3NhbWw6TmFtZUlEPgogICAgICAgIDxzYW1sOlN1YmplY3RDb25maXJtYXRpb24KICAgICAgICAgIE1ldGhvZD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmNtOmJlYXJlciI+CiAgICAgICAgICA8c2FtbDpTdWJqZWN0Q29uZmlybWF0aW9uRGF0YQogICAgICAgICAgICBJblJlc3BvbnNlVG89ImlkZW50aWZpZXJfMSIKICAgICAgICAgICAgUmVjaXBpZW50PSJodHRwczovL3NwLmV4YW1wbGUuY29tL1NBTUwyL1NTTy9QT1NUIgogICAgICAgICAgICBOb3RPbk9yQWZ0ZXI9IjIwMDQtMTItMDVUMDk6Mjc6MDUiLz4KICAgICAgICA8L3NhbWw6U3ViamVjdENvbmZpcm1hdGlvbj4KICAgICAgPC9zYW1sOlN1YmplY3Q+CiAgICAgIDxzYW1sOkNvbmRpdGlvbnMKICAgICAgICBOb3RCZWZvcmU9IjIwMDQtMTItMDVUMDk6MTc6MDUiCiAgICAgICAgTm90T25PckFmdGVyPSIyMDA0LTEyLTA1VDA5OjI3OjA1Ij4KICAgICAgICA8c2FtbDpBdWRpZW5jZVJlc3RyaWN0aW9uPgogICAgICAgICAgPHNhbWw6QXVkaWVuY2U+aHR0cHM6Ly9zcC5leGFtcGxlLmNvbS9TQU1MMjwvc2FtbDpBdWRpZW5jZT4KICAgICAgICA8L3NhbWw6QXVkaWVuY2VSZXN0cmljdGlvbj4KICAgICAgPC9zYW1sOkNvbmRpdGlvbnM+CiAgICAgIDxzYW1sOkF1dGhuU3RhdGVtZW50CiAgICAgICAgQXV0aG5JbnN0YW50PSIyMDA0LTEyLTA1VDA5OjIyOjAwIgogICAgICAgIFNlc3Npb25JbmRleD0iaWRlbnRpZmllcl8zIj4KICAgICAgICA8c2FtbDpBdXRobkNvbnRleHQ+CiAgICAgICAgICA8c2FtbDpBdXRobkNvbnRleHRDbGFzc1JlZj4KICAgICAgICAgICAgdXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmFjOmNsYXNzZXM6UGFzc3dvcmRQcm90ZWN0ZWRUcmFuc3BvcnQKICAgICAgICAgPC9zYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPgogICAgICAgIDwvc2FtbDpBdXRobkNvbnRleHQ+CiAgICAgIDwvc2FtbDpBdXRoblN0YXRlbWVudD4KICAgIDwvc2FtbDpBc3NlcnRpb24+CiAgPC9zYW1scDpSZXNwb25zZT4=');

    samlDecoded = window.decode(tokenEditor.val()).result;

    xmlEditor.setValue(samlDecoded);

    var data = parseSaml(samlDecoded);
    $(".saml-info").html(template(data));
  });

  $('.jwt-playground .expand').click(function(e) {
    $(this).hide();
    $('.jwt-playground .collapse').show();
    $('.jwt-playground .token').hide();
    $('.jwt-playground .xml.col-md-6').removeClass('col-md-6').addClass('col-md-12');
  });

  $('.jwt-playground .collapse').click(function(e) {
    $(this).hide();
    $('.jwt-playground .expand').show();
    $('.jwt-playground .token').show();
    $('.jwt-playground .xml.col-md-12').removeClass('col-md-12').addClass('col-md-6');
  });
}());

//CANVAS
$(function(){
  var canvas = document.querySelector('canvas'),
      ctx = canvas.getContext('2d'),
      color = '#000000';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  ctx.fillStyle = color;
  ctx.lineWidth = .1;
  ctx.strokeStyle = color;

  var mousePosition = {
    x: 30 * canvas.width / 100,
    y: 30 * canvas.height / 100
  };

  var dots = {
    nb: 300,
    distance: 100,
    d_radius: 150,
    array: []
  };

  function Dot(){
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;

    this.vx = -.5 + Math.random();
    this.vy = -.5 + Math.random();

    this.radius = Math.random();
  }

  Dot.prototype = {
    create: function(){
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
      ctx.fill();
    },

    animate: function(){
      for(i = 0; i < dots.nb; i++){

        var dot = dots.array[i];

        if(dot.y < 0 || dot.y > canvas.height){
          dot.vx = dot.vx;
          dot.vy = - dot.vy;
        }
        else if(dot.x < 0 || dot.x > canvas.width){
          dot.vx = - dot.vx;
          dot.vy = dot.vy;
        }
        dot.x += dot.vx;
        dot.y += dot.vy;
      }
    },

    line: function(){
      for(i = 0; i < dots.nb; i++){
        for(j = 0; j < dots.nb; j++){
          i_dot = dots.array[i];
          j_dot = dots.array[j];

          if((i_dot.x - j_dot.x) < dots.distance && (i_dot.y - j_dot.y) < dots.distance && (i_dot.x - j_dot.x) > - dots.distance && (i_dot.y - j_dot.y) > - dots.distance){
            if((i_dot.x - mousePosition.x) < dots.d_radius && (i_dot.y - mousePosition.y) < dots.d_radius && (i_dot.x - mousePosition.x) > - dots.d_radius && (i_dot.y - mousePosition.y) > - dots.d_radius){
              ctx.beginPath();
              ctx.moveTo(i_dot.x, i_dot.y);
              ctx.lineTo(j_dot.x, j_dot.y);
              ctx.stroke();
              ctx.closePath();
            }
          }
        }
      }
    }
  };

  function createDots(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(i = 0; i < dots.nb; i++){
      dots.array.push(new Dot());
      dot = dots.array[i];

      dot.create();
    }

    dot.line();
    dot.animate();
  }

  $('canvas').on('mousemove mouseleave', function(e){
    if(e.type == 'mousemove'){
      mousePosition.x = e.pageX;
      mousePosition.y = e.pageY;
    }
    if(e.type == 'mouseleave'){
      mousePosition.x = canvas.width / 2;
      mousePosition.y = canvas.height / 2;
    }
  });
  setInterval(createDots, 1000/30); 
});