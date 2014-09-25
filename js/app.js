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

    if (!samlObj.Response) { return; }

    if (!samlObj.Response.Assertion) { return; }

    samlObj = samlObj.Response;

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
    tokenEditor.val(jwt || 'PHNhbWxwOlJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wiIHhtbG5zOnNhbWw9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphc3NlcnRpb24iCiAgICBJRD0iaWRlbnRpZmllcl8yIgogICAgSW5SZXNwb25zZVRvPSJpZGVudGlmaWVyXzEiCiAgICBWZXJzaW9uPSIyLjAiCiAgICBJc3N1ZUluc3RhbnQ9IjIwMDQtMTItMDVUMDk6MjI6MDUiCiAgICBEZXN0aW5hdGlvbj0iaHR0cHM6Ly9zcC5leGFtcGxlLmNvbS9TQU1MMi9TU08vUE9TVCI+PHNhbWw6SXNzdWVyPmh0dHBzOi8vaWRwLmV4YW1wbGUub3JnL1NBTUwyPC9zYW1sOklzc3Vlcj48c2FtbHA6U3RhdHVzPjxzYW1scDpTdGF0dXNDb2RlCiAgICAgICAgVmFsdWU9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpzdGF0dXM6U3VjY2VzcyIvPjwvc2FtbHA6U3RhdHVzPjxzYW1sOkFzc2VydGlvbiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIgogICAgICBJRD0iaWRlbnRpZmllcl8zIgogICAgICBWZXJzaW9uPSIyLjAiCiAgICAgIElzc3VlSW5zdGFudD0iMjAwNC0xMi0wNVQwOToyMjowNSI+PHNhbWw6SXNzdWVyPmh0dHBzOi8vaWRwLmV4YW1wbGUub3JnL1NBTUwyPC9zYW1sOklzc3Vlcj48ZHM6U2lnbmF0dXJlIHhtbG5zOmRzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj48ZHM6U2lnbmVkSW5mbz48ZHM6Q2Fub25pY2FsaXphdGlvbk1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIgLz48ZHM6U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxkc2lnLW1vcmUjcnNhLXNoYTI1NiIgLz48ZHM6UmVmZXJlbmNlIFVSST0iI19kZTlmMjliZC01MmNhLTQyMzctOTVjMS1lYjUzZjcwZmU4ZTUiPjxkczpUcmFuc2Zvcm1zPjxkczpUcmFuc2Zvcm0gQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjZW52ZWxvcGVkLXNpZ25hdHVyZSIgLz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIiAvPjwvZHM6VHJhbnNmb3Jtcz48ZHM6RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjc2hhMjU2IiAvPjxkczpEaWdlc3RWYWx1ZT4rNk9XVW4xZEZJVUpRNkZRMjV6Z21admc4elB6ZmNqbmo0dWpVdmdmbUVRPTwvZHM6RGlnZXN0VmFsdWU+PC9kczpSZWZlcmVuY2U+PC9kczpTaWduZWRJbmZvPjxkczpTaWduYXR1cmVWYWx1ZT5PODV5dFM5ZmNBaE9rLzBLMjVTbmR5QlViTkxyeDZKK3R2K1VodCtIWlo0Q3pzcWpWQlUxRnBrWGpERzAzSHFaN3hFdTMrck1uc3l4ZWZEcTZYZnR3MUU5MjZRc0cvb1BNL2FmV2ZiUjVkTHVjanNWYU56WENYelp1K2pCbXA1S2tBdi92djFFczY3S25QTXIvUkRlQ1ZGeTlleXhKa2E2ZGQ4aDhSVGxhdGc9PC9kczpTaWduYXR1cmVWYWx1ZT48S2V5SW5mbyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnIyI+PFg1MDlEYXRhPjxYNTA5Q2VydGlmaWNhdGU+TUlJQ0dqQ0NBWU9nQXdJQkFnSVFlSmU1cVIrNFQ2VkpOWll0V2poRXJ6QU5CZ2txaGtpRzl3MEJBUVFGQURBZ01SNHdIQVlEVlFRREV4VkJRMU15UTJ4cFpXNTBRMlZ5ZEdsbWFXTmhkR1V3SGhjTk1URXhNREV3TURjd01EQXdXaGNOTkRFeE1qTXhNRGN3TURBd1dqQWdNUjR3SEFZRFZRUURFeFZCUTFNeVEyeHBaVzUwUTJWeWRHbG1hV05oZEdVd2daOHdEUVlKS29aSWh2Y05BUUVCQlFBRGdZMEFNSUdKQW9HQkFLanRybkorYmR1UkVvc1E5K1NIMW9jSTEzd2x4U3RMaTh5NWhlR1BvNVVCY3VmMGhZUnE0UHZqd0VZMnR3ZWJQNml3eGp3R3FodTIyNFVEVWZQV01oUUJPaCtORm52OUdIQWgrVzRqRkp4dlRDY3lYVGtaUkZxZ0FZUmpNdnl4ek5lSFZxbjRBSi9kZEtHZjFmTVZDdUtoUFl0ZUh5MnlOYWNYdWp1Y1BQNi9BZ01CQUFHalZUQlRNRkVHQTFVZEFRUktNRWlBRUZEMy83dWhHY0kyblNIWnFCMGJONjZoSWpBZ01SNHdIQVlEVlFRREV4VkJRMU15UTJ4cFpXNTBRMlZ5ZEdsbWFXTmhkR1dDRUhpWHVha2Z1RStsU1RXV0xWbzRSSzh3RFFZSktvWklodmNOQVFFRUJRQURnWUVBa2d4a3RWVTVlOFRWb2lnc0RSbTRxeXc2Z00va2llM2U2ZEZNMFQxQkZvUVYwUFc5Vzl5S1BpUDcyZVRpKzMzMXRMRm53RHh6NVJKTEFCY3RBTzcxcGx3dFJFZDBrM0UwSnNqdStXZWIrdThZY0NENDNhVmlRWGdYUnJZNWdoREd3cEZSY2FOYTFQbllZNW5rM0RZZnlaWmR6MUwrZmIzMFZEaXVnZGY3ZEJJPTwvWDUwOUNlcnRpZmljYXRlPjwvWDUwOURhdGE+PC9LZXlJbmZvPjwvZHM6U2lnbmF0dXJlPjxzYW1sOlN1YmplY3Q+PHNhbWw6TmFtZUlECiAgICAgICAgICBGb3JtYXQ9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpuYW1laWQtZm9ybWF0OnRyYW5zaWVudCI+CiAgICAgICAgICAzZjdiM2RjZi0xNjc0LTRlY2QtOTJjOC0xNTQ0ZjM0NmJhZjgKICAgICAgICA8L3NhbWw6TmFtZUlEPjxzYW1sOlN1YmplY3RDb25maXJtYXRpb24KICAgICAgICAgIE1ldGhvZD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmNtOmJlYXJlciI+PHNhbWw6U3ViamVjdENvbmZpcm1hdGlvbkRhdGEKICAgICAgICAgICAgSW5SZXNwb25zZVRvPSJpZGVudGlmaWVyXzEiCiAgICAgICAgICAgIFJlY2lwaWVudD0iaHR0cHM6Ly9zcC5leGFtcGxlLmNvbS9TQU1MMi9TU08vUE9TVCIKICAgICAgICAgICAgTm90T25PckFmdGVyPSIyMDA0LTEyLTA1VDA5OjI3OjA1Ii8+PC9zYW1sOlN1YmplY3RDb25maXJtYXRpb24+PC9zYW1sOlN1YmplY3Q+PHNhbWw6Q29uZGl0aW9ucwogICAgICAgIE5vdEJlZm9yZT0iMjAwNC0xMi0wNVQwOToxNzowNSIKICAgICAgICBOb3RPbk9yQWZ0ZXI9IjIwMDQtMTItMDVUMDk6Mjc6MDUiPjxzYW1sOkF1ZGllbmNlUmVzdHJpY3Rpb24+PHNhbWw6QXVkaWVuY2U+aHR0cHM6Ly9zcC5leGFtcGxlLmNvbS9TQU1MMjwvc2FtbDpBdWRpZW5jZT48L3NhbWw6QXVkaWVuY2VSZXN0cmljdGlvbj48L3NhbWw6Q29uZGl0aW9ucz48c2FtbDpBdHRyaWJ1dGVTdGF0ZW1lbnQgeG1sbnM6eHM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvWE1MU2NoZW1hIiB4bWxuczp4c2k9Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvWE1MU2NoZW1hLWluc3RhbmNlIj48c2FtbDpBdHRyaWJ1dGUgTmFtZT0iaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZWlkZW50aWZpZXIiPjxzYW1sOkF0dHJpYnV0ZVZhbHVlIHhzaTp0eXBlPSJ4czphbnlUeXBlIj4xMjM0NTY3ODwvc2FtbDpBdHRyaWJ1dGVWYWx1ZT48L3NhbWw6QXR0cmlidXRlPjxzYW1sOkF0dHJpYnV0ZSBOYW1lPSJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9lbWFpbGFkZHJlc3MiPjxzYW1sOkF0dHJpYnV0ZVZhbHVlIHhzaTp0eXBlPSJ4czphbnlUeXBlIj5qZm9vQGdtYWlsLmNvbTwvc2FtbDpBdHRyaWJ1dGVWYWx1ZT48L3NhbWw6QXR0cmlidXRlPjxzYW1sOkF0dHJpYnV0ZSBOYW1lPSJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1lIj48c2FtbDpBdHRyaWJ1dGVWYWx1ZSB4c2k6dHlwZT0ieHM6YW55VHlwZSI+Sm9obiBGb288L3NhbWw6QXR0cmlidXRlVmFsdWU+PC9zYW1sOkF0dHJpYnV0ZT48c2FtbDpBdHRyaWJ1dGUgTmFtZT0iaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvZ2l2ZW5uYW1lIj48c2FtbDpBdHRyaWJ1dGVWYWx1ZSB4c2k6dHlwZT0ieHM6YW55VHlwZSI+Sm9objwvc2FtbDpBdHRyaWJ1dGVWYWx1ZT48L3NhbWw6QXR0cmlidXRlPjxzYW1sOkF0dHJpYnV0ZSBOYW1lPSJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9zdXJuYW1lIj48c2FtbDpBdHRyaWJ1dGVWYWx1ZSB4c2k6dHlwZT0ieHM6YW55VHlwZSI+Rm9vPC9zYW1sOkF0dHJpYnV0ZVZhbHVlPjwvc2FtbDpBdHRyaWJ1dGU+PC9zYW1sOkF0dHJpYnV0ZVN0YXRlbWVudD48c2FtbDpBdXRoblN0YXRlbWVudAogICAgICAgIEF1dGhuSW5zdGFudD0iMjAwNC0xMi0wNVQwOToyMjowMCIKICAgICAgICBTZXNzaW9uSW5kZXg9ImlkZW50aWZpZXJfMyI+PHNhbWw6QXV0aG5Db250ZXh0PjxzYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPgogICAgICAgICAgICB1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YWM6Y2xhc3NlczpQYXNzd29yZFByb3RlY3RlZFRyYW5zcG9ydAogICAgICAgICA8L3NhbWw6QXV0aG5Db250ZXh0Q2xhc3NSZWY+PC9zYW1sOkF1dGhuQ29udGV4dD48L3NhbWw6QXV0aG5TdGF0ZW1lbnQ+PC9zYW1sOkFzc2VydGlvbj48L3NhbWxwOlJlc3BvbnNlPg==');

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