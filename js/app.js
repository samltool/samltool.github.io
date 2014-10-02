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
    console.log(samlObj);
    if (!samlObj) { return; }

    if (samlObj.Response) {
      samlObj = samlObj.Response;
    } else if (!samlObj.Assertion) {
       return;
    }

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
    } else if (samlObj.Assertion._Issuer) {
      if (samlObj.Assertion._Issuer) {
        samlData.issuer = samlObj.Assertion._Issuer;
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
          var audience = samlObj.Assertion.Conditions.AudienceRestrictionCondition.Audience;

          if (audience) {
            samlData.audience = audience;
          }
        }
      }
    }

    if (samlObj.Assertion.Signature) {
      if (samlObj.Assertion.Signature.KeyInfo) {
        if (samlObj.Assertion.Signature.KeyInfo.X509Data) {
          if (samlObj.Assertion.Signature.KeyInfo.X509Data.X509Certificate) {
            var public_key = samlObj.Assertion.Signature.KeyInfo.X509Data.X509Certificate;
            
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
      var attributes = samlObj.Assertion.AttributeStatement.Attribute;
      
      if (attributes) {
        var attr = {};
        var values;

        if (!isArray(attributes)) {
          attr[getAttributeName(attributes, version)] = getValues(attributes.AttributeValue, version);
        } else {
          for (var i = attributes.length - 1; i >= 0; i--) {
            var values = attributes[i].AttributeValue;
            attr[getAttributeName(attributes[i], version)] = getValues(attributes[i].AttributeValue, version);
          };
        }

        samlData.attributes = attr;
      }
    }

    console.log(samlData);
    return samlData;
  }

  function getValues(values, version) {
    var val;

    if (version === '2.0') {
      if (!isArray(values)) {
        val = [values.__text];
      } else {
        val = [];
        for (var j = values.length - 1; j >= 0; j--) {
          val.push(values[j].__text);
        };
      }
    } else {
      if (!isArray(values)) {
        val = [values];
      } else {
        val = values;
      }

      console.log(val);
    }
    return val;
  }

  function getAttributeName(attribute, version) {
    var name;
    
    if (version === '2.0') {
      if (attribute._FriendlyName) {
        name = attribute._FriendlyName;
      } else {
        name = attribute._Name;
      }
    } else {
      name = attribute._AttributeName;
    }

    return name;
  }

  $('#prettify').on('change', function() {
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
    if ($('#prettify').is(':checked')) {
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
    tokenEditor.val(jwt || 'PFJlc3BvbnNlIAogIHhtbG5zPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjA6cHJvdG9jb2wiIAogIHhtbG5zOnNhbWw9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjEuMDphc3NlcnRpb24iIAogIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjA6cHJvdG9jb2wiIAogIHhtbG5zOnhzZD0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEiIAogIHhtbG5zOnhzaT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2UiIAogIElzc3VlSW5zdGFudD0iMjAxMi0xMS0wOFQwMzozMjowNC40NzlaIiAKICBNYWpvclZlcnNpb249IjEiIE1pbm9yVmVyc2lvbj0iMSIgCiAgUmVjaXBpZW50PSJodHRwczovL2Nhc2Rldi5jYy5jb2x1bWJpYS5lZHUvY2FzLXRlc3QvcHJpbnRBdHRyaWJ1dGVzIiAKICBSZXNwb25zZUlEPSJfYjQwNjAxY2Q1NGRmMWFkYjFjNDViMDIzY2Y1ZjFiNWYiPgo8U3RhdHVzPgogIDxTdGF0dXNDb2RlIFZhbHVlPSJzYW1scDpTdWNjZXNzIj48L1N0YXR1c0NvZGU+CjwvU3RhdHVzPgo8QXNzZXJ0aW9uIAogIHhtbG5zPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjA6YXNzZXJ0aW9uIiAKICBBc3NlcnRpb25JRD0iXzNkNTFlYjNkNWZiMWIwNjA4NTM2ZTlhZWFlZmViNTdkIiAKICBJc3N1ZUluc3RhbnQ9IjIwMTItMTEtMDhUMDM6MzI6MDQuNDc5WiIgCiAgSXNzdWVyPSJsb2NhbGhvc3QiIAogIE1ham9yVmVyc2lvbj0iMSIgTWlub3JWZXJzaW9uPSIxIj4KPENvbmRpdGlvbnMgCiAgTm90QmVmb3JlPSIyMDEyLTExLTA4VDAzOjMyOjA0LjQ3OVoiIAogIE5vdE9uT3JBZnRlcj0iMjAxMi0xMS0wOFQwMzozMjozNC40NzlaIj4KPEF1ZGllbmNlUmVzdHJpY3Rpb25Db25kaXRpb24+CjxBdWRpZW5jZT5odHRwczovL2Nhc2Rldi5jYy5jb2x1bWJpYS5lZHUvY2FzLXRlc3QvcHJpbnRBdHRyaWJ1dGVzPC9BdWRpZW5jZT4KPC9BdWRpZW5jZVJlc3RyaWN0aW9uQ29uZGl0aW9uPgo8L0NvbmRpdGlvbnM+CjxBdHRyaWJ1dGVTdGF0ZW1lbnQ+CjxTdWJqZWN0PgogIDxOYW1lSWRlbnRpZmllcj5kZTM8L05hbWVJZGVudGlmaWVyPgogIDxTdWJqZWN0Q29uZmlybWF0aW9uPgogIDxDb25maXJtYXRpb25NZXRob2Q+dXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6MS4wOmNtOmFydGlmYWN0PC9Db25maXJtYXRpb25NZXRob2Q+CiAgPC9TdWJqZWN0Q29uZmlybWF0aW9uPgo8L1N1YmplY3Q+CjxBdHRyaWJ1dGUgCiAgQXR0cmlidXRlTmFtZT0ibGFzdFBhc3N3b3JkQ2hhbmdlRGF0ZSIKICBBdHRyaWJ1dGVOYW1lc3BhY2U9Imh0dHA6Ly93d3cuamEtc2lnLm9yZy9wcm9kdWN0cy9jYXMvIj4KICA8QXR0cmlidXRlVmFsdWU+RnJpIEp1biAyOSAxNjowNjozOSBFRFQgMjAxMjwvQXR0cmlidXRlVmFsdWU+CjwvQXR0cmlidXRlPgo8QXR0cmlidXRlIAogIEF0dHJpYnV0ZU5hbWU9ImFmZmlsaWF0aW9uIgogIEF0dHJpYnV0ZU5hbWVzcGFjZT0iaHR0cDovL3d3dy5qYS1zaWcub3JnL3Byb2R1Y3RzL2Nhcy8iPgogIDxBdHRyaWJ1dGVWYWx1ZT5pdC5zdGFmZjpjb2x1bWJpYS5lZHU8L0F0dHJpYnV0ZVZhbHVlPgogIDxBdHRyaWJ1dGVWYWx1ZT5hZC5vdC5zdGFmZjpjb2x1bWJpYS5lZHU8L0F0dHJpYnV0ZVZhbHVlPgogIDxBdHRyaWJ1dGVWYWx1ZT5mdC5hZC5vdC5zdGFmZjpjb2x1bWJpYS5lZHU8L0F0dHJpYnV0ZVZhbHVlPgogIDxBdHRyaWJ1dGVWYWx1ZT5zdGFmZjpjb2x1bWJpYS5lZHU8L0F0dHJpYnV0ZVZhbHVlPgogIDxBdHRyaWJ1dGVWYWx1ZT5vZmZpY2VyOmNvbHVtYmlhLmVkdTwvQXR0cmlidXRlVmFsdWU+CiAgPEF0dHJpYnV0ZVZhbHVlPmFjaXMuc3RhZmY6Y29sdW1iaWEuZWR1PC9BdHRyaWJ1dGVWYWx1ZT4KPC9BdHRyaWJ1dGU+CjwvQXR0cmlidXRlU3RhdGVtZW50Pgo8QXV0aGVudGljYXRpb25TdGF0ZW1lbnQgCiAgQXV0aGVudGljYXRpb25JbnN0YW50PSIyMDEyLTExLTA4VDAzOjMyOjAzLjk4NVoiIAogIEF1dGhlbnRpY2F0aW9uTWV0aG9kPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjA6YW06dW5zcGVjaWZpZWQiPgo8U3ViamVjdD4KPE5hbWVJZGVudGlmaWVyPmRlMzwvTmFtZUlkZW50aWZpZXI+CjxTdWJqZWN0Q29uZmlybWF0aW9uPgo8Q29uZmlybWF0aW9uTWV0aG9kPnVybjpvYXNpczpuYW1lczp0YzpTQU1MOjEuMDpjbTphcnRpZmFjdDwvQ29uZmlybWF0aW9uTWV0aG9kPgo8L1N1YmplY3RDb25maXJtYXRpb24+CjwvU3ViamVjdD4KPC9BdXRoZW50aWNhdGlvblN0YXRlbWVudD4KIDxTaWduYXR1cmUgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPgogIDxTaWduZWRJbmZvPgogICA8Q2Fub25pY2FsaXphdGlvbk1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPgogICA8U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGExIi8+CiAgIDxSZWZlcmVuY2UgVVJJPSIjQTRCNDEzNzQ0LTI4N0MtNEE4Ri04RDBELUM5MjgzRjE5QTMzOSI+CiAgICA8VHJhbnNmb3Jtcz4KICAgICA8VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+CiAgICA8L1RyYW5zZm9ybXM+CiAgICA8RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3NoYTEiLz4KICAgIDxEaWdlc3RWYWx1ZT5XYlZRNTU3WDJsVTJUY3JtUWIxaG40eU9Qa0k9PC9EaWdlc3RWYWx1ZT4KICAgPC9SZWZlcmVuY2U+CiAgPC9TaWduZWRJbmZvPgogIDxTaWduYXR1cmVWYWx1ZT5SNGZRK3dOaWU5UmV5MStoQWNEWTNKVnozRHI3clVQT3JkNEpadVc3dmhiVFNKRlNrYVV3KwpsUFlCL2w4ZEVKSU1UbTY5OUd3QXErbUozaklWK3liZWE3ZVE5WFFUQWZoWnBwQVFucis2azhrZGtRbklMbGlZSkxrMFdJek9JSTFsOU9JL3ZpK0FMOFB6b2xZb3dTUWh2cnVzS2wzaXpLY0FrOWQrdkwrNlFZPQo8L1NpZ25hdHVyZVZhbHVlPgogIDxLZXlJbmZvPgogICA8WDUwOURhdGE+CiAgICA8WDUwOUNlcnRpZmljYXRlPk1JSUI0RENDQVVtZ0F3SUJBZ0lRYUpzR3RZV0FYZ0M3OGlSLzlLWEdEREtOQmdrcWhsaUc5dzBCQVFVRkFEQXJNUTh3RFFZRFZRClFLRXdaemVYTjBaVzB4R0RBV0JnTlZCQWJVRGs4dmJtbDBiM0pBUTA1RU1UTXdNREFlRncwd09UQXpNRGt4TXpFeU5UQmFGdzB4T1RBek1EY3hNegpFeU5UQmFNREl4SHpBZEJnTlZCQU1URm5OcGJtZHNaU0J6YVdkdUxXOXVJSE5sY25acFkyVXhEekFOQmdOVkJBb1RCbk41YzNSbGJUQ0JuekFOQmdrcWhraUc5CncwQkFRRUZBQU9CalFBd2dZa0NnWUVBdXIxTlJuTHJTOVJlcG5LQTFaTXlmemNmdjRCNWIyTnhXRGJUeGJwV1ZiSnEvcCtUcDlyK2FrV1dpUmMyMGNaUUg5ZXMKU0o5bjNLOEtMZ2UvVkxVUFlTV0tKdDdQK2dxTFJhemU0YS9XNTFjWUFDNVFQK1UvS1AvVUoyY3NEdzExTUkwbWFnRFZRWjFmWlRqTzJzK2o5TENjcHFPMExCelhRClRFaG1yblpieEVDQXdFQUFUQU5CZ2txaGtpRzl3MEJBUVVGQUFPQmdRQ20zYTRFZzk0Zzl4cUlzd05oSHU2Yit5SnBtSE84V0RnSGRHeVoya1EwVmV6QmEKMEVDaXQ1N2Fac3pjbzdxRzJaSXduVjVXeEJZRkQrUG1jcWpjWEZoemt2aUhpbGVab1RwV0ZjZkVweVN2b2t3bHJHejlCRHlybjZGeUdDM1lmWjhOMGVlWHlKVzVBawpOQUQ1OUNTbkVibGlMUE5PTjJUUXBlT2FlTDByb1VnPT08L1g1MDlDZXJ0aWZpY2F0ZT4KICAgPC9YNTA5RGF0YT4KICA8L0tleUluZm8+CiA8L1NpZ25hdHVyZT4KPC9Bc3NlcnRpb24+CjwvUmVzcG9uc2U+');

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