(function() {
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

  var source = $("#saml-info-template").html();
  var template = Handlebars.compile(source);

  function tabHack(instance) {
    instance.replaceSelection('   ', 'end');
  }

  function formatXml(xml) {
    return xml;
    var formatted = '';
    var reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    var pad = 0;
    jQuery.each(xml.split('\r\n'), function(index, node) {
      var indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/)) {
        if (pad != 0) {
          pad -= 1;
        }
      } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
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

  CodeMirror.commands.autocomplete = function(cm) {
    CodeMirror.showHint(cm, CodeMirror.hint.xml);
  };

  var foldFunc = CodeMirror.newFoldFunction(CodeMirror.tagRangeFinder);

  window.xmlEditor = CodeMirror(document.getElementsByClassName('xml-input')[0], {
    mode: 'text/html',
    htmlMode: false,
    autofocus: true,
    lineNumbers: true,
    // lineWrapping: true,
    extraKeys: {
      'Tab': tabHack,
      "Ctrl-Q": function(cm) {
        foldFunc(cm, cm.getCursor().line);
      }
    },
    foldGutter: true,
    onGutterClick: foldFunc,
    glutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    matchTags: {
      bothTags: true
    }
  });

  foldFunc(xmlEditor, 1);

  function saveToStorage(saml) {
    // Save last valid saml value for refresh
    localStorage.samlValue = saml;
  }

  function loadFromStorage(cb) {
    cb(localStorage.samlValue);
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
    // console.log(samlObj);
    if (!samlObj) {
      return;
    }

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

    if (samlObj.Assertion.Subject) {
      if (samlObj.Assertion.Subject.NameID) {
        if (samlObj.Assertion.Subject.NameID.__text) {
          samlData.nameId = samlObj.Assertion.Subject.NameID.__text;
        }
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
              public_key = public_key.replace(/(\r\n|\n|\r)/gm, "");
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

    // console.log(samlData);
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

      // console.log(val);
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

  loadFromStorage(function(saml) {
    tokenEditor.val(saml || 'PHNhbWxwOlJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wiIElEPSJfNjIxYzRjNGFlNWQ2MGM3NjhjYzIiICBWZXJzaW9uPSIyLjAiIElzc3VlSW5zdGFudD0iMjAxNC0xMC0xNFQxNDozMjoxN1oiICBEZXN0aW5hdGlvbj0iaHR0cHM6Ly9hcHAuYXV0aDAuY29tL3Rlc3Rlci9zYW1scCI+PHNhbWw6SXNzdWVyIHhtbG5zOnNhbWw9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphc3NlcnRpb24iPnVybjptYXR1Z2l0LmF1dGgwLmNvbTwvc2FtbDpJc3N1ZXI+PHNhbWxwOlN0YXR1cz48c2FtbHA6U3RhdHVzQ29kZSBWYWx1ZT0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnN0YXR1czpTdWNjZXNzIi8+PC9zYW1scDpTdGF0dXM+PHNhbWw6QXNzZXJ0aW9uIHhtbG5zOnNhbWw9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphc3NlcnRpb24iIFZlcnNpb249IjIuMCIgSUQ9Il81Vks3TFQ3RmxpVWtrYVF1VzZyNGJyRjBERzVFM1g3NiIgSXNzdWVJbnN0YW50PSIyMDE0LTEwLTE0VDE0OjMyOjE3LjI1MVoiPjxzYW1sOklzc3Vlcj51cm46bWF0dWdpdC5hdXRoMC5jb208L3NhbWw6SXNzdWVyPjxTaWduYXR1cmUgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxTaWduZWRJbmZvPjxDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PFNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNyc2Etc2hhMSIvPjxSZWZlcmVuY2UgVVJJPSIjXzVWSzdMVDdGbGlVa2thUXVXNnI0YnJGMERHNUUzWDc2Ij48VHJhbnNmb3Jtcz48VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI2VudmVsb3BlZC1zaWduYXR1cmUiLz48VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9UcmFuc2Zvcm1zPjxEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIvPjxEaWdlc3RWYWx1ZT5aRGtmR08zSDFUdTUwaGF3elFWanNBQ3pKd2M9PC9EaWdlc3RWYWx1ZT48L1JlZmVyZW5jZT48L1NpZ25lZEluZm8+PFNpZ25hdHVyZVZhbHVlPjFGZ3B0N0FhSGNNRTJnVEExNThhY2h2R1FWcUR3SFNIc0hGMy9hNXM3ZGplTzFBYVo4NEd6NWVpV0QrY2RJejZob1QxajJ2LzdRdGZqNWJzTU54dWxCblN6Zkw0VFQ0KytBSy96Rk80YWQybXdBQkZqTU1OaW9nd3dUM3R6eTNhUndqZ1NmbDNWS0VTb3ozWnA4S0wvSk5tL1RSS3o5NVREN0g2V25mS1pvTHdFckd6Tnc2Z1ZzMXk5WFl4SUVnNDZHelViMDdnMjNURm1ydjN3SGx4MlRwS1VOL25lNFoyOEtBUXpYcVZ5eWtKVmFLUS9nYkJOQy84QVFLbG9sOGZMR1NoZU9LUTB2Z0VFMXZGblZWQ0VtcDMwWWFwZEtlV1cycWNxSGI3T3FkbSs5YjJtT1VrcWJheEg1aXhCYllhcVphUUN0NVdGNFA1QnhuTWU0QnA4dz09PC9TaWduYXR1cmVWYWx1ZT48S2V5SW5mbz48WDUwOURhdGE+PFg1MDlDZXJ0aWZpY2F0ZT5NSUlET0RDQ0FpQ2dBd0lCQWdJSkFON085aGVmMDVSSk1BMEdDU3FHU0liM0RRRUJCUVVBTUJ3eEdqQVlCZ05WQkFNVEVXMWhkSFZuYVhRdVlYVjBhREF1WTI5dE1CNFhEVEV6TURZeE5qRXpNalF3TmxvWERUSTNNREl5TXpFek1qUXdObG93SERFYU1CZ0dBMVVFQXhNUmJXRjBkV2RwZEM1aGRYUm9NQzVqYjIwd2dnRWlNQTBHQ1NxR1NJYjNEUUVCQVFVQUE0SUJEd0F3Z2dFS0FvSUJBUUQ4a0VmRWNMaXlNSzBxNEU0eFQvbWdsY1hzZjlvQ1dkVGpCMHZzd0ZYUVBDRGdVazVkYUptTzRvUnJDSXVXZ3RDaER5TWM1TTVNVGV4cXJDbnRRbEtwbmV4a3pEeEN2UFgvSVJKc3RqSkRTSCtXWGxqUllEYlhUZ0FaQWpqakFLcURCSWVVV2F3MUZjVXkzU09tUVZ0eVVkZmpYTnFMenhLUzhTVVdZWTNJYTZQVC91b1VqVUZtVXVKRUZwQmxCNzlHVytUdi9aaWRZNTNnSHloRVlPQnptMXZLWlMxdnRQZnh4cEJxdTdWa2YrNWxxM1JZanVvVlVZTjAzVElKdmVhYTdCQkwwamU4ejdVdnZPR2dyR3VvZFNLSG5lcTd1ZWV4NE9Dc2NDSlpiSzdNbGZibUZpdVNuaVZDZy95TXJ4L29rRG1lMzhzT1hIMUEvekp1MmxZcEFnTUJBQUdqZlRCN01CMEdBMVVkRGdRV0JCUUwzY3VEWE5YdTRVU3JwdjQ0ZHpmR3lISVhEVEJNQmdOVkhTTUVSVEJEZ0JRTDNjdURYTlh1NFVTcnB2NDRkemZHeUhJWERhRWdwQjR3SERFYU1CZ0dBMVVFQXhNUmJXRjBkV2RwZEM1aGRYUm9NQzVqYjIyQ0NRRGV6dllYbjlPVVNUQU1CZ05WSFJNRUJUQURBUUgvTUEwR0NTcUdTSWIzRFFFQkJRVUFBNElCQVFDQXRBbUtIb1g3T2VyekZVUTBPanJnOUMxdXpUNmZPTElsWHlhRHN3azJ0TEU2ZnRGaFNpVnpUMVR0Z1RGdjJvNklBNDd0VzZicUw3dDZaNUpOL0w4Y25vK2t4ZUtPZ1B6MkN2YlVUSm10Uk92RlYvVERrRnNZbUZKWjgrNm5aT0F0WFJaUFdGcGE2S0U0TGM1KzdKOTRzWDJBaVlQRkNuWFJ2WkdNaEo2cXRjK2poNTRRRUlseFp0a3hXVUJHczJmaE9RbStVeDB1eTFxeFN6aHAzbG12TmE3OUtkdm1RaXJTaXREb3Z5aWRhbHB3WDc1MFdHTmZRb0lTZTk0ZTNjbFdhNHVLWGdaN0FZbWhkMXc0a05zN3NlRmR0dkNjcVFKcktZVDJjQlRJTnp0TDZTZXFlRi94Qy8vbEdEbzlVSmljNHBjcnFqMVAzV0dIWUlzbE9XQlE8L1g1MDlDZXJ0aWZpY2F0ZT48L1g1MDlEYXRhPjwvS2V5SW5mbz48L1NpZ25hdHVyZT48c2FtbDpTdWJqZWN0PjxzYW1sOk5hbWVJRCBGb3JtYXQ9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjEuMTpuYW1laWQtZm9ybWF0OnVuc3BlY2lmaWVkIj5naXRodWJ8MTc1ODgwPC9zYW1sOk5hbWVJRD48c2FtbDpTdWJqZWN0Q29uZmlybWF0aW9uIE1ldGhvZD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmNtOmJlYXJlciI+PHNhbWw6U3ViamVjdENvbmZpcm1hdGlvbkRhdGEgTm90T25PckFmdGVyPSIyMDE0LTEwLTE0VDE1OjMyOjE3LjI1MVoiIFJlY2lwaWVudD0iaHR0cHM6Ly9hcHAuYXV0aDAuY29tL3Rlc3Rlci9zYW1scCIvPjwvc2FtbDpTdWJqZWN0Q29uZmlybWF0aW9uPjwvc2FtbDpTdWJqZWN0PjxzYW1sOkNvbmRpdGlvbnMgTm90QmVmb3JlPSIyMDE0LTEwLTE0VDE0OjMyOjE3LjI1MVoiIE5vdE9uT3JBZnRlcj0iMjAxNC0xMC0xNFQxNTozMjoxNy4yNTFaIj48c2FtbDpBdWRpZW5jZVJlc3RyaWN0aW9uPjxzYW1sOkF1ZGllbmNlPnVybjpmb288L3NhbWw6QXVkaWVuY2U+PC9zYW1sOkF1ZGllbmNlUmVzdHJpY3Rpb24+PC9zYW1sOkNvbmRpdGlvbnM+PHNhbWw6QXR0cmlidXRlU3RhdGVtZW50IHhtbG5zOnhzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxL1hNTFNjaGVtYSIgeG1sbnM6eHNpPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxL1hNTFNjaGVtYS1pbnN0YW5jZSI+PHNhbWw6QXR0cmlidXRlIE5hbWU9Imh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIj48c2FtbDpBdHRyaWJ1dGVWYWx1ZSB4c2k6dHlwZT0ieHM6YW55VHlwZSI+Z2l0aHVifDE3NTg4MDwvc2FtbDpBdHRyaWJ1dGVWYWx1ZT48L3NhbWw6QXR0cmlidXRlPjxzYW1sOkF0dHJpYnV0ZSBOYW1lPSJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9lbWFpbGFkZHJlc3MiPjxzYW1sOkF0dHJpYnV0ZVZhbHVlIHhzaTp0eXBlPSJ4czphbnlUeXBlIj5tYXRpYXN3QGdtYWlsLmNvbTwvc2FtbDpBdHRyaWJ1dGVWYWx1ZT48L3NhbWw6QXR0cmlidXRlPjxzYW1sOkF0dHJpYnV0ZSBOYW1lPSJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1lIj48c2FtbDpBdHRyaWJ1dGVWYWx1ZSB4c2k6dHlwZT0ieHM6YW55VHlwZSI+TWF0aWFzIFdvbG9za2k8L3NhbWw6QXR0cmlidXRlVmFsdWU+PC9zYW1sOkF0dHJpYnV0ZT48c2FtbDpBdHRyaWJ1dGUgTmFtZT0iaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvdXBuIj48c2FtbDpBdHRyaWJ1dGVWYWx1ZSB4c2k6dHlwZT0ieHM6YW55VHlwZSI+bWF0aWFzd0BnbWFpbC5jb208L3NhbWw6QXR0cmlidXRlVmFsdWU+PC9zYW1sOkF0dHJpYnV0ZT48c2FtbDpBdHRyaWJ1dGUgTmFtZT0iaHR0cDovL3NjaGVtYXMuYXV0aDAuY29tL2lkZW50aXRpZXMvZGVmYXVsdC9hY2Nlc3NfdG9rZW4iPjxzYW1sOkF0dHJpYnV0ZVZhbHVlIHhzaTp0eXBlPSJ4czphbnlUeXBlIj4zYTdkMGRmZWZmZTEyODEyYzM3MTEyZGFhODMwYWJlZjU3MDA4OWI0PC9zYW1sOkF0dHJpYnV0ZVZhbHVlPjwvc2FtbDpBdHRyaWJ1dGU+PHNhbWw6QXR0cmlidXRlIE5hbWU9Imh0dHA6Ly9zY2hlbWFzLmF1dGgwLmNvbS9pZGVudGl0aWVzL2RlZmF1bHQvcHJvdmlkZXIiPjxzYW1sOkF0dHJpYnV0ZVZhbHVlIHhzaTp0eXBlPSJ4czphbnlUeXBlIj5naXRodWI8L3NhbWw6QXR0cmlidXRlVmFsdWU+PC9zYW1sOkF0dHJpYnV0ZT48c2FtbDpBdHRyaWJ1dGUgTmFtZT0iaHR0cDovL3NjaGVtYXMuYXV0aDAuY29tL2lkZW50aXRpZXMvZGVmYXVsdC9jb25uZWN0aW9uIj48c2FtbDpBdHRyaWJ1dGVWYWx1ZSB4c2k6dHlwZT0ieHM6YW55VHlwZSI+Z2l0aHViPC9zYW1sOkF0dHJpYnV0ZVZhbHVlPjwvc2FtbDpBdHRyaWJ1dGU+PHNhbWw6QXR0cmlidXRlIE5hbWU9Imh0dHA6Ly9zY2hlbWFzLmF1dGgwLmNvbS9pZGVudGl0aWVzL2RlZmF1bHQvaXNTb2NpYWwiPjxzYW1sOkF0dHJpYnV0ZVZhbHVlIHhzaTp0eXBlPSJ4czphbnlUeXBlIj50cnVlPC9zYW1sOkF0dHJpYnV0ZVZhbHVlPjwvc2FtbDpBdHRyaWJ1dGU+PC9zYW1sOkF0dHJpYnV0ZVN0YXRlbWVudD48c2FtbDpBdXRoblN0YXRlbWVudCBBdXRobkluc3RhbnQ9IjIwMTQtMTAtMTRUMTQ6MzI6MTcuMjUxWiI+PHNhbWw6QXV0aG5Db250ZXh0PjxzYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPnVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphYzpjbGFzc2VzOnVuc3BlY2lmaWVkPC9zYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPjwvc2FtbDpBdXRobkNvbnRleHQ+PC9zYW1sOkF1dGhuU3RhdGVtZW50Pjwvc2FtbDpBc3NlcnRpb24+PC9zYW1scDpSZXNwb25zZT4=');

    samlDecoded = window.decode(tokenEditor.val()).result;

    xmlEditor.setValue(vkbeautify.xml(samlDecoded));
    xmlEditor.setOption("readOnly", true);

    var data = parseSaml(samlDecoded);
    $(".saml-info").html(template(data));
  });

  $('.saml-playground .expand').click(function(e) {
    $(this).hide();
    $('.saml-playground .collapse').show();
    $('.saml-playground .token').hide();
    $('.saml-playground .xml.col-md-6').removeClass('col-md-6').addClass('col-md-12');
  });

  $('.saml-playground .collapse').click(function(e) {
    $(this).hide();
    $('.saml-playground .expand').show();
    $('.saml-playground .token').show();
    $('.saml-playground .xml.col-md-12').removeClass('col-md-12').addClass('col-md-6');
  });
}());

//CANVAS
$(function() {
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

  function Dot() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;

    this.vx = -.5 + Math.random();
    this.vy = -.5 + Math.random();

    this.radius = Math.random();
  }

  Dot.prototype = {
    create: function() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
      ctx.fill();
    },

    animate: function() {
      for (i = 0; i < dots.nb; i++) {

        var dot = dots.array[i];

        if (dot.y < 0 || dot.y > canvas.height) {
          dot.vx = dot.vx;
          dot.vy = -dot.vy;
        } else if (dot.x < 0 || dot.x > canvas.width) {
          dot.vx = -dot.vx;
          dot.vy = dot.vy;
        }
        dot.x += dot.vx;
        dot.y += dot.vy;
      }
    },

    line: function() {
      for (i = 0; i < dots.nb; i++) {
        for (j = 0; j < dots.nb; j++) {
          i_dot = dots.array[i];
          j_dot = dots.array[j];

          if ((i_dot.x - j_dot.x) < dots.distance && (i_dot.y - j_dot.y) < dots.distance && (i_dot.x - j_dot.x) > -dots.distance && (i_dot.y - j_dot.y) > -dots.distance) {
            if ((i_dot.x - mousePosition.x) < dots.d_radius && (i_dot.y - mousePosition.y) < dots.d_radius && (i_dot.x - mousePosition.x) > -dots.d_radius && (i_dot.y - mousePosition.y) > -dots.d_radius) {
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

  function createDots() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (i = 0; i < dots.nb; i++) {
      dots.array.push(new Dot());
      dot = dots.array[i];

      dot.create();
    }

    dot.line();
    dot.animate();
  }

  $('canvas').on('mousemove mouseleave', function(e) {
    if (e.type == 'mousemove') {
      mousePosition.x = e.pageX;
      mousePosition.y = e.pageY;
    }
    if (e.type == 'mouseleave') {
      mousePosition.x = canvas.width / 2;
      mousePosition.y = canvas.height / 2;
    }
  });
  setInterval(createDots, 1000 / 30);
});