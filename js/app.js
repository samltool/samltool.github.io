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

  var tokenEditor = $('.token-input');

  var xmlEditor = CodeMirror(document.getElementsByClassName('xml-input')[0], {
    mode: 'text/html',
    // theme: 'night', 
    htmlMode: false,
    autofocus: true,
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

  function parseSaml(samlEncoded) {

    if (!samlEncoded) {
      return;
    }

    samlDecoded = window.decode(samlEncoded).result;

    if (!samlDecoded) {
      return;
    }

    if ($('.prettify:checked').length) {
      samlDecoded = vkbeautify.xml(samlDecoded);
    }

    xmlEditor.setValue(samlDecoded);

    var samlObj = x2js.xml_str2json(samlDecoded);

    if (!samlObj) { return; }

    if (!samlObj.Response) { return; }
      console.log(samlObj);
    if (!samlObj.Response.Assertion) { return; }

    samlObj = samlObj.Response;

    var samlData = {};

    if (samlObj._Version) {
      samlData.version = samlObj._Version;
    }

    if (samlObj.Issuer) {
      var issuer = samlObj.Issuer.__text;

      if (issuer) {
          samlData.issuer = samlObj.issuer;
      }
    }

    if (samlObj.Assertion.Conditions) {
      var date = samlObj.Assertion.Conditions._NotOnOrAfter;
      if (date) {
          samlData.expires = new Date(date);
      }

      if (samlObj.Assertion.Conditions.AudienceRestriction) {
          if (samlObj.Assertion.Conditions.AudienceRestriction.Audience) {
              var audiences = samlObj.Assertion.Conditions.AudienceRestriction.Audience.__text;

              if (audiences) {
                samlData.audiences = audiences;
              }
          }
      }
    }

    if (samlObj.Assertion.Signature) {
      if (samlObj.Assertion.Signature.KeyInfo) {
        if (samlObj.Assertion.Signature.KeyInfo.X509Data) {
          if (samlObj.Assertion.Signature.KeyInfo.X509Data.X509Certificate) {
            var public_key = samlObj.Assertion.Signature.KeyInfo.X509Data.X509Certificate.__text;
            
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
          for (var i = attributes.length - 1; i >= 0; i--) {
            var values = attributes[i].AttributeValue;
            if (!isArray(values)) {
              attr[attributes[i]._Name] = [values.__text];
            } else {
              attr[attributes[i]._Name] = [];

              for (var j = values.length - 1; j >= 0; j--) {
                attr[attributes[i]._Name].push(values[j].__text);
              };
            }
          };
          console.log(attr);
        }
    }

    return samlData;
  }

  $('.prettify').on('change', function() {
    if ($('.prettify:checked').length) {
      samlDecoded = vkbeautify.xml(samlDecoded);
    }

    xmlEditor.setValue(samlDecoded);
  });

  tokenEditor.on('change keypress paste textInput input', function() {
    var data = parseSaml(tokenEditor.val());
    $(".saml-info").html(template(data));
  });

  xmlEditor.on('change', function(cm) {
    var unencoded = window.encode(xmlEditor.getValue());
    tokenEditor.val(unencoded);
    // var data = parseSaml(unencoded);
    // $(".saml-info").html(template(data));
  });

  loadFromStorage(function (jwt) {
    tokenEditor.val(jwt || 'PFJlc3BvbnNlDQogICAgeG1sbnM9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpwcm90b2NvbCIgRGVzdGluYXRpb249Imh0dHBzOi8vcHdjdGVzdC5hdXRoMC5jb20vbG9naW4vY2FsbGJhY2s/Y29ubmVjdGlvbj1TaXRlbWluZGVyRGV2IiBJRD0iX2I5NGZmNTRmYzk5ZDM0MzAwNDIxZmJkYzMyMWM2MzM2ZWM1ZCIgSW5SZXNwb25zZVRvPSJfNGFmOGFkZDBlNzZhMjA3MjY2ODQiIElzc3VlSW5zdGFudD0iMjAxNC0wOC0xMlQwMzoxODo1MVoiIFZlcnNpb249IjIuMCI+DQogICAgPG5zMTpJc3N1ZXINCiAgICAgICAgeG1sbnM6bnMxPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBGb3JtYXQ9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpuYW1laWQtZm9ybWF0OmVudGl0eSI+aHR0cHM6Ly9wYXJ0bmVyc2hpcC1kZXYucHdjaW50ZXJuYWwuY29tDQogICAgPC9uczE6SXNzdWVyPg0KICAgIDxTdGF0dXM+DQogICAgICAgIDxTdGF0dXNDb2RlIFZhbHVlPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6c3RhdHVzOlN1Y2Nlc3MiLz4NCiAgICA8L1N0YXR1cz4NCiAgICA8bnMyOkFzc2VydGlvbg0KICAgICAgICB4bWxuczpuczI9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphc3NlcnRpb24iIElEPSJfMTI4OTE0ZWEzYWJiYmUzYjE3ODNjNjg5Y2JlYjc3NWI1NDgyIiBJc3N1ZUluc3RhbnQ9IjIwMTQtMDgtMTJUMDM6MTg6NTFaIiBWZXJzaW9uPSIyLjAiPg0KICAgICAgICA8bnMyOklzc3VlciBGb3JtYXQ9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpuYW1laWQtZm9ybWF0OmVudGl0eSI+aHR0cHM6Ly9wYXJ0bmVyc2hpcC1kZXYucHdjaW50ZXJuYWwuY29tPC9uczI6SXNzdWVyPg0KICAgICAgICA8ZHM6U2lnbmF0dXJlDQogICAgICAgICAgICB4bWxuczpkcz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnIyI+DQogICAgICAgICAgICA8ZHM6U2lnbmVkSW5mbz4NCiAgICAgICAgICAgICAgICA8ZHM6Q2Fub25pY2FsaXphdGlvbk1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPg0KICAgICAgICAgICAgICAgIDxkczpTaWduYXR1cmVNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjcnNhLXNoYTEiLz4NCiAgICAgICAgICAgICAgICA8ZHM6UmVmZXJlbmNlIFVSST0iI18xMjg5MTRlYTNhYmJiZTNiMTc4M2M2ODljYmViNzc1YjU0ODIiPg0KICAgICAgICAgICAgICAgICAgICA8ZHM6VHJhbnNmb3Jtcz4NCiAgICAgICAgICAgICAgICAgICAgICAgIDxkczpUcmFuc2Zvcm0gQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjZW52ZWxvcGVkLXNpZ25hdHVyZSIvPg0KICAgICAgICAgICAgICAgICAgICAgICAgPGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPg0KICAgICAgICAgICAgICAgICAgICA8L2RzOlRyYW5zZm9ybXM+DQogICAgICAgICAgICAgICAgICAgIDxkczpEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIvPg0KICAgICAgICAgICAgICAgICAgICA8ZHM6RGlnZXN0VmFsdWU+cFV1aHZjMk1DVXBjQUZMbVM1a1FWR0tCbzhFPTwvZHM6RGlnZXN0VmFsdWU+DQogICAgICAgICAgICAgICAgPC9kczpSZWZlcmVuY2U+DQogICAgICAgICAgICA8L2RzOlNpZ25lZEluZm8+DQogICAgICAgICAgICA8ZHM6U2lnbmF0dXJlVmFsdWU+DQppdFB6eXpuMXdCKzNyMEM0Ynl4VUM0QS9PNmVaQzltbVJzOHNFME1OUm1ZSVRMNTQvQ0xISjJUZW1YRW9iQzIxb1V2UURsYkk1SUV2DQpGb0phRlV1QVVua3FRT2pVUE9TM2xETTNHSE5BZHNmU1hJZjBqRkNQekJ6N1A5WEcwQmRlNEFvVnVIL1NSdVdvajZLK1dQMUh3WDhIDQpaQ2VRTHNRQWRjaVk1ekpRZ1BCRStuL3c0c3ptb3g2NlcrejY5UTFFa3M3aDZGMEN0QXppSjlvbkdlU1FOVCsyVnpSWFBIQzJ3Q0p1DQpJUHA0NTAyZ0xZZzRMZHBDdHh2TXdwYkdkS243WWQ2NUhxa1I4WSsxTE9NYm1ZT2JNOG1rWDdrOVMvQm9TQUg5cm4zMVFOb0lXMGxnDQo2YkM4YkcwV3FZSG5RRWszeEJ2N0lLdklBVVhTRS91VEdvOXZ2QT09DQo8L2RzOlNpZ25hdHVyZVZhbHVlPg0KICAgICAgICAgICAgPGRzOktleUluZm8+DQogICAgICAgICAgICAgICAgPGRzOlg1MDlEYXRhPg0KICAgICAgICAgICAgICAgICAgICA8ZHM6WDUwOUNlcnRpZmljYXRlPg0KTUlJR0FEQ0NCT2lnQXdJQkFnSUtIb1ZkdmdBREFCSy9sREFOQmdrcWhraUc5dzBCQVFVRkFEQlVNUk13RVFZS0NaSW1pWlB5TEdRQg0KR1JZRFkyOXRNUk13RVFZS0NaSW1pWlB5TEdRQkdSWURjSGRqTVNnd0pnWURWUVFERXg5UWNtbGpaWGRoZEdWeWFHOTFjMlZEYjI5dw0KWlhKeklFbHpjM1ZwYm1jeE1CNFhEVEV6TURVd016RTVNelF3TkZvWERURTFNVEV3TXpFNU5EUXdORm93Z2JReEN6QUpCZ05WQkFZVA0KQWxWVE1SQXdEZ1lEVlFRSUV3ZEdiRzl5YVdSaE1RNHdEQVlEVlFRSEV3VlVZVzF3WVRFak1DRUdBMVVFQ2hNYVVISnBZMlYzWVhSbA0KY21odmRYTmxRMjl2Y0dWeWN5Qk1URkF4RERBS0JnTlZCQXNUQTBkVVV6RW9NQ1lHQTFVRUF4TWZjR0Z5ZEc1bGNuTm9hWEF0WkdWMg0KTG5CM1kybHVkR1Z5Ym1Gc0xtTnZiVEVtTUNRR0NTcUdTSWIzRFFFSkFSWVhibUYyYVc0dVltaGhkR2xoUUhWekxuQjNZeTVqYjIwdw0KZ2dFaU1BMEdDU3FHU0liM0RRRUJBUVVBQTRJQkR3QXdnZ0VLQW9JQkFRQzdyQ2ZnQ09nczAyOTZydWxDUTlkK0NQTXJmRHVobmY0TQ0KZ0IzdmEweUVMNzlxL1Z1Tk5nOGF6bVpFZEEyYjBOQVhKTG8weStYR2Nsa2Vab003V2hBNGljMDlJTjYrM01VRXp2L3l5Z3U3b0RoZg0KZ2p0cGxQaEFLV09CcVprT0pRWnc3ZHpGcGxySzhrbmNtVkdRLzEvSWhraXZZS2xubXVuRUpoeWNmNVE3UWVnam56N0RWSFN1eUxnYg0Kd01nMzlmNndwb2xDWnJza3U4cFVQdjFWb3JXMW9SR1ZQYm5Bd1VHTXprZCtaSER4VGtCVjNTQlJ1cklrbC9rVDY3aFJmVW9VdE4xcA0KVU0yZkkya2ZCSTM1NS9Cc0l0YzFZenFmRGZPM2hzbEtWQjljUy9EWHlxU3REOTFucTh2QVFvekJqMWlTSDdKRjl1UGFFWVlxSGgxLw0KVnA4L0FnTUJBQUdqZ2dKeE1JSUNiVEFkQmdOVkhRNEVGZ1FVdWd0dzcwakR1bGNsbDMvVmtmYVZBcVdTQ1Y4d0h3WURWUjBqQkJndw0KRm9BVVFxYTEzNXU2d2Nobm5sK25ldGkrR25VL2RPMHdnZ0VMQmdOVkhSOEVnZ0VDTUlIL01JSDhvSUg1b0lIMmhsQm9kSFJ3T2k4dg0KWTJWeWRHUmhkR0V4TG5CM1kybHVkR1Z5Ym1Gc0xtTnZiUzlEWlhKMFJHRjBZVEV2VUhKcFkyVjNZWFJsY21odmRYTmxRMjl2Y0dWeQ0KY3lVeU1FbHpjM1ZwYm1jeExtTnliSVpRYUhSMGNEb3ZMMk5sY25Sa1lYUmhNaTV3ZDJOcGJuUmxjbTVoYkM1amIyMHZRMlZ5ZEVSaA0KZEdFeUwxQnlhV05sZDJGMFpYSm9iM1Z6WlVOdmIzQmxjbk1sTWpCSmMzTjFhVzVuTVM1amNteUdVR2gwZEhBNkx5OWpaWEowWkdGMA0KWVRNdWNIZGphVzUwWlhKdVlXd3VZMjl0TDBObGNuUkVZWFJoTXk5UWNtbGpaWGRoZEdWeWFHOTFjMlZEYjI5d1pYSnpKVEl3U1hOeg0KZFdsdVp6RXVZM0pzTUlJQkdnWUlLd1lCQlFVSEFRRUVnZ0VNTUlJQkNEQ0JnUVlJS3dZQkJRVUhNQUtHZFdoMGRIQTZMeTlqWlhKMA0KWkdGMFlURXVjSGRqYVc1MFpYSnVZV3d1WTI5dEwwTmxjblJFWVhSaE1TOTFjM1J3WVRObmRITmpZVEF6TG01aGJTNXdkMk5wYm5SbA0KY201aGJDNWpiMjFmVUhKcFkyVjNZWFJsY21odmRYTmxRMjl2Y0dWeWN5VXlNRWx6YzNWcGJtY3hLRE1wTG1OeWREQ0JnUVlJS3dZQg0KQlFVSE1BS0dkV2gwZEhBNkx5OWpaWEowWkdGMFlUSXVjSGRqYVc1MFpYSnVZV3d1WTI5dEwwTmxjblJFWVhSaE1pOTFjM1J3WVRObg0KZEhOallUQXpMbTVoYlM1d2QyTnBiblJsY201aGJDNWpiMjFmVUhKcFkyVjNZWFJsY21odmRYTmxRMjl2Y0dWeWN5VXlNRWx6YzNWcA0KYm1jeEtETXBMbU55ZERBTkJna3Foa2lHOXcwQkFRVUZBQU9DQVFFQXFmaHdkYzdGSm9jZE5sOUl6TThXbU53SGQ4RktRdmY1SnM0WQ0KREdtYzA4dmQ0S2I0c1lvTS9NVHNTcGxBTHM0SCt3cklmTG1RSHVwZlpURTJlQzV0UmtBd3VaVkdCNEdKOWtHMCtROXYzWTM2bzU3dw0KNmhrekJVRkorSmlic3NrVDVKTU12WlZ4ekhtdCt2eXZrWm5QVmtrSlpKdURwN01vK2dHWk12OGk0VVYrR1p5WUFna0tQQ1F0d3VRSg0KeWhPdDBtQVA4Q29XbFcrNUNnWVYyc1g0Qm1FbmVvS2NSbWV5UjQ5U0NhRDhRUVplZXIrSENjRHpybDlnUDhpZDdTZ0U0cS96TW1HeA0KQkVtR01EMldJMncyejZ6dXd0MlJLRVp5eEFCZGtldlQ5OFhubUEyNGdETFV2bGMzV3dpRXdsZGFtL2lUeFVua1dIQ0dselp4Rll1Mg0KU0E9PQ0KPC9kczpYNTA5Q2VydGlmaWNhdGU+DQogICAgICAgICAgICAgICAgPC9kczpYNTA5RGF0YT4NCiAgICAgICAgICAgIDwvZHM6S2V5SW5mbz4NCiAgICAgICAgPC9kczpTaWduYXR1cmU+DQogICAgICAgIDxuczI6U3ViamVjdD4NCiAgICAgICAgICAgIDxuczI6TmFtZUlEIEZvcm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6MS4xOm5hbWVpZC1mb3JtYXQ6dW5zcGVjaWZpZWQiPjEwMDAxNjkwOTE8L25zMjpOYW1lSUQ+DQogICAgICAgICAgICA8bnMyOlN1YmplY3RDb25maXJtYXRpb24gTWV0aG9kPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6Y206YmVhcmVyIj4NCiAgICAgICAgICAgICAgICA8bnMyOlN1YmplY3RDb25maXJtYXRpb25EYXRhIEluUmVzcG9uc2VUbz0iXzRhZjhhZGQwZTc2YTIwNzI2Njg0IiBOb3RPbk9yQWZ0ZXI9IjIwMTQtMDgtMTJUMDM6MjA6NTFaIiBSZWNpcGllbnQ9Imh0dHBzOi8vcHdjdGVzdC5hdXRoMC5jb20vbG9naW4vY2FsbGJhY2s/Y29ubmVjdGlvbj1TaXRlbWluZGVyRGV2Ii8+DQogICAgICAgICAgICA8L25zMjpTdWJqZWN0Q29uZmlybWF0aW9uPg0KICAgICAgICA8L25zMjpTdWJqZWN0Pg0KICAgICAgICA8bnMyOkNvbmRpdGlvbnMgTm90QmVmb3JlPSIyMDE0LTA4LTEyVDAzOjE3OjUxWiIgTm90T25PckFmdGVyPSIyMDE0LTA4LTEyVDAzOjIwOjUxWiI+DQogICAgICAgICAgICA8bnMyOkF1ZGllbmNlUmVzdHJpY3Rpb24+DQogICAgICAgICAgICAgICAgPG5zMjpBdWRpZW5jZT51cm46YXNzZW1pbmRlckRldjwvbnMyOkF1ZGllbmNlPg0KICAgICAgICAgICAgPC9uczI6QXVkaWVuY2VSZXN0cmljdGlvbj4NCiAgICAgICAgPC9uczI6Q29uZGl0aW9ucz4NCiAgICAgICAgPG5zMjpBdXRoblN0YXRlbWVudCBBdXRobkluc3RhbnQ9IjIwMTQtMDgtMTFUMjM6Mjg6MjVaIiBTZXNzaW9uSW5kZXg9Im0rNVErM1hsVXNRQVE5RFkyV2hwcWhFYUw1Yz1hd3k4ZlE9PSIgU2Vzc2lvbk5vdE9uT3JBZnRlcj0iMjAxNC0wOC0xMlQwMzoyMDo1MVoiPg0KICAgICAgICAgICAgPG5zMjpBdXRobkNvbnRleHQ+DQogICAgICAgICAgICAgICAgPG5zMjpBdXRobkNvbnRleHRDbGFzc1JlZj51cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YWM6Y2xhc3NlczpQYXNzd29yZDwvbnMyOkF1dGhuQ29udGV4dENsYXNzUmVmPg0KICAgICAgICAgICAgPC9uczI6QXV0aG5Db250ZXh0Pg0KICAgICAgICA8L25zMjpBdXRoblN0YXRlbWVudD4NCiAgICAgICAgPG5zMjpBdHRyaWJ1dGVTdGF0ZW1lbnQ+DQogICAgICAgICAgICA8bnMyOkF0dHJpYnV0ZSBOYW1lPSJmbmFtZSIgTmFtZUZvcm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmF0dHJuYW1lLWZvcm1hdDp1bnNwZWNpZmllZCI+DQogICAgICAgICAgICAgICAgPG5zMjpBdHRyaWJ1dGVWYWx1ZT5QdXNocDwvbnMyOkF0dHJpYnV0ZVZhbHVlPg0KICAgICAgICAgICAgPC9uczI6QXR0cmlidXRlPg0KICAgICAgICAgICAgPG5zMjpBdHRyaWJ1dGUgTmFtZT0ibG5hbWUiIE5hbWVGb3JtYXQ9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphdHRybmFtZS1mb3JtYXQ6dW5zcGVjaWZpZWQiPg0KICAgICAgICAgICAgICAgIDxuczI6QXR0cmlidXRlVmFsdWU+QWJyb2w8L25zMjpBdHRyaWJ1dGVWYWx1ZT4NCiAgICAgICAgICAgIDwvbnMyOkF0dHJpYnV0ZT4NCiAgICAgICAgICAgIDxuczI6QXR0cmlidXRlIE5hbWU9ImVtYWlsIiBOYW1lRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXR0cm5hbWUtZm9ybWF0OnVuc3BlY2lmaWVkIj4NCiAgICAgICAgICAgICAgICA8bnMyOkF0dHJpYnV0ZVZhbHVlPnB1c2hwLmFicm9sQHVzLnB3Yy5jb208L25zMjpBdHRyaWJ1dGVWYWx1ZT4NCiAgICAgICAgICAgICAgICA8bnMyOkF0dHJpYnV0ZVZhbHVlPnBzc3Nzc3NAdXMucHdjLmNvbTwvbnMyOkF0dHJpYnV0ZVZhbHVlPg0KICAgICAgICAgICAgICAgIDxuczI6QXR0cmlidXRlVmFsdWU+cHNzc3Nzc0B1cy5wd2MuY29tPC9uczI6QXR0cmlidXRlVmFsdWU+DQogICAgICAgICAgICAgICAgPG5zMjpBdHRyaWJ1dGVWYWx1ZT5wc3Nzc3NzQHVzLnB3Yy5jb208L25zMjpBdHRyaWJ1dGVWYWx1ZT4NCiAgICAgICAgICAgICAgICA8bnMyOkF0dHJpYnV0ZVZhbHVlPnBzc3Nzc3NAdXMucHdjLmNvbTwvbnMyOkF0dHJpYnV0ZVZhbHVlPg0KICAgICAgICAgICAgICAgIDxuczI6QXR0cmlidXRlVmFsdWU+cHNzc3Nzc0B1YXNkYXNkbTwvbnMyOkF0dHJpYnV0ZVZhbHVlPg0KICAgICAgICAgICAgPC9uczI6QXR0cmlidXRlPg0KICAgICAgICAgICAgPG5zMjpBdHRyaWJ1dGUgTmFtZT0icHdjZ3VpZCIgTmFtZUZvcm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmF0dHJuYW1lLWZvcm1hdDp1bnNwZWNpZmllZCI+DQogICAgICAgICAgICAgICAgPG5zMjpBdHRyaWJ1dGVWYWx1ZT5wYWJyb2wwMDE8L25zMjpBdHRyaWJ1dGVWYWx1ZT4NCiAgICAgICAgICAgIDwvbnMyOkF0dHJpYnV0ZT4NCiAgICAgICAgPC9uczI6QXR0cmlidXRlU3RhdGVtZW50Pg0KICAgIDwvbnMyOkFzc2VydGlvbj4NCjwvUmVzcG9uc2U+');
    var data = parseSaml(tokenEditor.val());
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