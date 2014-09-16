(function () {
  var x2js = new X2JS();

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

  function parseSaml(samlEncoded, cb) {

    if (!samlEncoded) {
      return;
    }

    var samlDecoded = window.decode(samlEncoded).result;

    if (!samlDecoded) {
      return;
    }

    xmlEditor.setValue(vkbeautify.xml(samlDecoded));

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

    cb(samlData);
  }

  tokenEditor.on('change keypress paste textInput input', function() {
    parseSaml(tokenEditor.val(), function(samlData) {
      console.log(samlData);
      $(".saml-info").html(template(samlData));
    });
  });

  xmlEditor.on('change', function(cm) {
    tokenEditor.val(window.encode(xmlEditor.getValue()));
  });

  loadFromStorage(function (jwt) {
    tokenEditor.val(jwt || 'PFJlc3BvbnNlIHhtbG5zPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wiIERl\r\nc3RpbmF0aW9uPSJodHRwczovL3B3Y3Rlc3QuYXV0aDAuY29tL2xvZ2luL2NhbGxiYWNrP2Nvbm5l\r\nY3Rpb249U2l0ZW1pbmRlckRldiIgSUQ9Il9iOTRmZjU0ZmM5OWQzNDMwMDQyMWZiZGMzMjFjNjMz\r\nNmVjNWQiIEluUmVzcG9uc2VUbz0iXzRhZjhhZGQwZTc2YTIwNzI2Njg0IiBJc3N1ZUluc3RhbnQ9\r\nIjIwMTQtMDgtMTJUMDM6MTg6NTFaIiBWZXJzaW9uPSIyLjAiPg0KICAgIDxuczE6SXNzdWVyIHht\r\nbG5zOm5zMT0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmFzc2VydGlvbiIgRm9ybWF0PSJ1\r\ncm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6bmFtZWlkLWZvcm1hdDplbnRpdHkiPmh0dHBzOi8v\r\ncGFydG5lcnNoaXAtZGV2LnB3Y2ludGVybmFsLmNvbTwvbnMxOklzc3Vlcj4NCiAgICA8U3RhdHVz\r\nPg0KICAgICAgICA8U3RhdHVzQ29kZSBWYWx1ZT0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4w\r\nOnN0YXR1czpTdWNjZXNzIi8+DQogICAgPC9TdGF0dXM+DQogICAgPG5zMjpBc3NlcnRpb24geG1s\r\nbnM6bnMyPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0iXzEyODkx\r\nNGVhM2FiYmJlM2IxNzgzYzY4OWNiZWI3NzViNTQ4MiIgSXNzdWVJbnN0YW50PSIyMDE0LTA4LTEy\r\nVDAzOjE4OjUxWiIgVmVyc2lvbj0iMi4wIj4NCiAgICAgICAgPG5zMjpJc3N1ZXIgRm9ybWF0PSJ1\r\ncm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6bmFtZWlkLWZvcm1hdDplbnRpdHkiPmh0dHBzOi8v\r\ncGFydG5lcnNoaXAtZGV2LnB3Y2ludGVybmFsLmNvbTwvbnMyOklzc3Vlcj48ZHM6U2lnbmF0dXJl\r\nIHhtbG5zOmRzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj4NCjxkczpTaWdu\r\nZWRJbmZvPg0KPGRzOkNhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3\r\nLnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz4NCjxkczpTaWduYXR1cmVNZXRob2QgQWxn\r\nb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjcnNhLXNoYTEiLz4NCjxk\r\nczpSZWZlcmVuY2UgVVJJPSIjXzEyODkxNGVhM2FiYmJlM2IxNzgzYzY4OWNiZWI3NzViNTQ4MiI+\r\nDQo8ZHM6VHJhbnNmb3Jtcz4NCjxkczpUcmFuc2Zvcm0gQWxnb3JpdGhtPSJodHRwOi8vd3d3Lncz\r\nLm9yZy8yMDAwLzA5L3htbGRzaWcjZW52ZWxvcGVkLXNpZ25hdHVyZSIvPg0KPGRzOlRyYW5zZm9y\r\nbSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPg0K\r\nPC9kczpUcmFuc2Zvcm1zPg0KPGRzOkRpZ2VzdE1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cu\r\ndzMub3JnLzIwMDAvMDkveG1sZHNpZyNzaGExIi8+DQo8ZHM6RGlnZXN0VmFsdWU+cFV1aHZjMk1D\r\nVXBjQUZMbVM1a1FWR0tCbzhFPTwvZHM6RGlnZXN0VmFsdWU+DQo8L2RzOlJlZmVyZW5jZT4NCjwv\r\nZHM6U2lnbmVkSW5mbz4NCjxkczpTaWduYXR1cmVWYWx1ZT4NCml0UHp5em4xd0IrM3IwQzRieXhV\r\nQzRBL082ZVpDOW1tUnM4c0UwTU5SbVlJVEw1NC9DTEhKMlRlbVhFb2JDMjFvVXZRRGxiSTVJRXYN\r\nCkZvSmFGVXVBVW5rcVFPalVQT1MzbERNM0dITkFkc2ZTWElmMGpGQ1B6Qno3UDlYRzBCZGU0QW9W\r\ndUgvU1J1V29qNksrV1AxSHdYOEgNClpDZVFMc1FBZGNpWTV6SlFnUEJFK24vdzRzem1veDY2Vyt6\r\nNjlRMUVrczdoNkYwQ3RBemlKOW9uR2VTUU5UKzJWelJYUEhDMndDSnUNCklQcDQ1MDJnTFlnNExk\r\ncEN0eHZNd3BiR2RLbjdZZDY1SHFrUjhZKzFMT01ibVlPYk04bWtYN2s5Uy9Cb1NBSDlybjMxUU5v\r\nSVcwbGcNCjZiQzhiRzBXcVlIblFFazN4QnY3SUt2SUFVWFNFL3VUR285dnZBPT0NCjwvZHM6U2ln\r\nbmF0dXJlVmFsdWU+DQo8ZHM6S2V5SW5mbz4NCjxkczpYNTA5RGF0YT4NCjxkczpYNTA5Q2VydGlm\r\naWNhdGU+DQpNSUlHQURDQ0JPaWdBd0lCQWdJS0hvVmR2Z0FEQUJLL2xEQU5CZ2txaGtpRzl3MEJB\r\nUVVGQURCVU1STXdFUVlLQ1pJbWlaUHlMR1FCDQpHUllEWTI5dE1STXdFUVlLQ1pJbWlaUHlMR1FC\r\nR1JZRGNIZGpNU2d3SmdZRFZRUURFeDlRY21salpYZGhkR1Z5YUc5MWMyVkRiMjl3DQpaWEp6SUVs\r\nemMzVnBibWN4TUI0WERURXpNRFV3TXpFNU16UXdORm9YRFRFMU1URXdNekU1TkRRd05Gb3dnYlF4\r\nQ3pBSkJnTlZCQVlUDQpBbFZUTVJBd0RnWURWUVFJRXdkR2JHOXlhV1JoTVE0d0RBWURWUVFIRXdW\r\nVVlXMXdZVEVqTUNFR0ExVUVDaE1hVUhKcFkyVjNZWFJsDQpjbWh2ZFhObFEyOXZjR1Z5Y3lCTVRG\r\nQXhEREFLQmdOVkJBc1RBMGRVVXpFb01DWUdBMVVFQXhNZmNHRnlkRzVsY25Ob2FYQXRaR1YyDQpM\r\nbkIzWTJsdWRHVnlibUZzTG1OdmJURW1NQ1FHQ1NxR1NJYjNEUUVKQVJZWGJtRjJhVzR1WW1oaGRH\r\nbGhRSFZ6TG5CM1l5NWpiMjB3DQpnZ0VpTUEwR0NTcUdTSWIzRFFFQkFRVUFBNElCRHdBd2dnRUtB\r\nb0lCQVFDN3JDZmdDT2dzMDI5NnJ1bENROWQrQ1BNcmZEdWhuZjRNDQpnQjN2YTB5RUw3OXEvVnVO\r\nTmc4YXptWkVkQTJiME5BWEpMbzB5K1hHY2xrZVpvTTdXaEE0aWMwOUlONiszTVVFenYveXlndTdv\r\nRGhmDQpnanRwbFBoQUtXT0JxWmtPSlFadzdkekZwbHJLOGtuY21WR1EvMS9JaGtpdllLbG5tdW5F\r\nSmh5Y2Y1UTdRZWdqbno3RFZIU3V5TGdiDQp3TWczOWY2d3BvbENacnNrdThwVVB2MVZvclcxb1JH\r\nVlBibkF3VUdNemtkK1pIRHhUa0JWM1NCUnVySWtsL2tUNjdoUmZVb1V0TjFwDQpVTTJmSTJrZkJJ\r\nMzU1L0JzSXRjMVl6cWZEZk8zaHNsS1ZCOWNTL0RYeXFTdEQ5MW5xOHZBUW96QmoxaVNIN0pGOXVQ\r\nYUVZWXFIaDEvDQpWcDgvQWdNQkFBR2pnZ0p4TUlJQ2JUQWRCZ05WSFE0RUZnUVV1Z3R3NzBqRHVs\r\nY2xsMy9Wa2ZhVkFxV1NDVjh3SHdZRFZSMGpCQmd3DQpGb0FVUXFhMTM1dTZ3Y2hubmwrbmV0aStH\r\nblUvZE8wd2dnRUxCZ05WSFI4RWdnRUNNSUgvTUlIOG9JSDVvSUgyaGxCb2RIUndPaTh2DQpZMlZ5\r\nZEdSaGRHRXhMbkIzWTJsdWRHVnlibUZzTG1OdmJTOURaWEowUkdGMFlURXZVSEpwWTJWM1lYUmxj\r\nbWh2ZFhObFEyOXZjR1Z5DQpjeVV5TUVsemMzVnBibWN4TG1OeWJJWlFhSFIwY0RvdkwyTmxjblJr\r\nWVhSaE1pNXdkMk5wYm5SbGNtNWhiQzVqYjIwdlEyVnlkRVJoDQpkR0V5TDFCeWFXTmxkMkYwWlhK\r\nb2IzVnpaVU52YjNCbGNuTWxNakJKYzNOMWFXNW5NUzVqY215R1VHaDBkSEE2THk5alpYSjBaR0Yw\r\nDQpZVE11Y0hkamFXNTBaWEp1WVd3dVkyOXRMME5sY25SRVlYUmhNeTlRY21salpYZGhkR1Z5YUc5\r\nMWMyVkRiMjl3WlhKekpUSXdTWE56DQpkV2x1WnpFdVkzSnNNSUlCR2dZSUt3WUJCUVVIQVFFRWdn\r\nRU1NSUlCQ0RDQmdRWUlLd1lCQlFVSE1BS0dkV2gwZEhBNkx5OWpaWEowDQpaR0YwWVRFdWNIZGph\r\nVzUwWlhKdVlXd3VZMjl0TDBObGNuUkVZWFJoTVM5MWMzUndZVE5uZEhOallUQXpMbTVoYlM1d2Qy\r\nTnBiblJsDQpjbTVoYkM1amIyMWZVSEpwWTJWM1lYUmxjbWh2ZFhObFEyOXZjR1Z5Y3lVeU1FbHpj\r\nM1ZwYm1jeEtETXBMbU55ZERDQmdRWUlLd1lCDQpCUVVITUFLR2RXaDBkSEE2THk5alpYSjBaR0Yw\r\nWVRJdWNIZGphVzUwWlhKdVlXd3VZMjl0TDBObGNuUkVZWFJoTWk5MWMzUndZVE5uDQpkSE5qWVRB\r\nekxtNWhiUzV3ZDJOcGJuUmxjbTVoYkM1amIyMWZVSEpwWTJWM1lYUmxjbWh2ZFhObFEyOXZjR1Z5\r\nY3lVeU1FbHpjM1ZwDQpibWN4S0RNcExtTnlkREFOQmdrcWhraUc5dzBCQVFVRkFBT0NBUUVBcWZo\r\nd2RjN0ZKb2NkTmw5SXpNOFdtTndIZDhGS1F2ZjVKczRZDQpER21jMDh2ZDRLYjRzWW9NL01Uc1Nw\r\nbEFMczRIK3dySWZMbVFIdXBmWlRFMmVDNXRSa0F3dVpWR0I0R0o5a0cwK1E5djNZMzZvNTd3DQo2\r\naGt6QlVGSitKaWJzc2tUNUpNTXZaVnh6SG10K3Z5dmtablBWa2tKWkp1RHA3TW8rZ0daTXY4aTRV\r\nVitHWnlZQWdrS1BDUXR3dVFKDQp5aE90MG1BUDhDb1dsVys1Q2dZVjJzWDRCbUVuZW9LY1JtZXlS\r\nNDlTQ2FEOFFRWmVlcitIQ2NEenJsOWdQOGlkN1NnRTRxL3pNbUd4DQpCRW1HTUQyV0kydzJ6Nnp1\r\nd3QyUktFWnl4QUJka2V2VDk4WG5tQTI0Z0RMVXZsYzNXd2lFd2xkYW0vaVR4VW5rV0hDR2x6WnhG\r\nWXUyDQpTQT09DQo8L2RzOlg1MDlDZXJ0aWZpY2F0ZT4NCjwvZHM6WDUwOURhdGE+DQo8L2RzOktl\r\neUluZm8+DQo8L2RzOlNpZ25hdHVyZT4NCiAgICAgICAgPG5zMjpTdWJqZWN0Pg0KICAgICAgICAg\r\nICAgPG5zMjpOYW1lSUQgRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjE6bmFtZWlk\r\nLWZvcm1hdDp1bnNwZWNpZmllZCI+MTAwMDE2OTA5MTwvbnMyOk5hbWVJRD4NCiAgICAgICAgICAg\r\nIDxuczI6U3ViamVjdENvbmZpcm1hdGlvbiBNZXRob2Q9InVybjpvYXNpczpuYW1lczp0YzpTQU1M\r\nOjIuMDpjbTpiZWFyZXIiPg0KICAgICAgICAgICAgICAgIDxuczI6U3ViamVjdENvbmZpcm1hdGlv\r\nbkRhdGEgSW5SZXNwb25zZVRvPSJfNGFmOGFkZDBlNzZhMjA3MjY2ODQiIE5vdE9uT3JBZnRlcj0i\r\nMjAxNC0wOC0xMlQwMzoyMDo1MVoiIFJlY2lwaWVudD0iaHR0cHM6Ly9wd2N0ZXN0LmF1dGgwLmNv\r\nbS9sb2dpbi9jYWxsYmFjaz9jb25uZWN0aW9uPVNpdGVtaW5kZXJEZXYiLz4NCiAgICAgICAgICAg\r\nIDwvbnMyOlN1YmplY3RDb25maXJtYXRpb24+DQogICAgICAgIDwvbnMyOlN1YmplY3Q+DQogICAg\r\nICAgIDxuczI6Q29uZGl0aW9ucyBOb3RCZWZvcmU9IjIwMTQtMDgtMTJUMDM6MTc6NTFaIiBOb3RP\r\nbk9yQWZ0ZXI9IjIwMTQtMDgtMTJUMDM6MjA6NTFaIj4NCiAgICAgICAgICAgIDxuczI6QXVkaWVu\r\nY2VSZXN0cmljdGlvbj4NCiAgICAgICAgICAgICAgICA8bnMyOkF1ZGllbmNlPnVybjphdXRoMDpw\r\nd2N0ZXN0OlNpdGVtaW5kZXJEZXY8L25zMjpBdWRpZW5jZT4NCiAgICAgICAgICAgIDwvbnMyOkF1\r\nZGllbmNlUmVzdHJpY3Rpb24+DQogICAgICAgIDwvbnMyOkNvbmRpdGlvbnM+DQogICAgICAgIDxu\r\nczI6QXV0aG5TdGF0ZW1lbnQgQXV0aG5JbnN0YW50PSIyMDE0LTA4LTExVDIzOjI4OjI1WiIgU2Vz\r\nc2lvbkluZGV4PSJtKzVRKzNYbFVzUUFROURZMldocHFoRWFMNWM9YXd5OGZRPT0iIFNlc3Npb25O\r\nb3RPbk9yQWZ0ZXI9IjIwMTQtMDgtMTJUMDM6MjA6NTFaIj4NCiAgICAgICAgICAgIDxuczI6QXV0\r\naG5Db250ZXh0Pg0KICAgICAgICAgICAgICAgIDxuczI6QXV0aG5Db250ZXh0Q2xhc3NSZWY+dXJu\r\nOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmFjOmNsYXNzZXM6UGFzc3dvcmQ8L25zMjpBdXRobkNv\r\nbnRleHRDbGFzc1JlZj4NCiAgICAgICAgICAgIDwvbnMyOkF1dGhuQ29udGV4dD4NCiAgICAgICAg\r\nPC9uczI6QXV0aG5TdGF0ZW1lbnQ+DQogICAgICAgIDxuczI6QXR0cmlidXRlU3RhdGVtZW50Pg0K\r\nICAgICAgICAgICAgPG5zMjpBdHRyaWJ1dGUgTmFtZT0iZm5hbWUiIE5hbWVGb3JtYXQ9InVybjpv\r\nYXNpczpuYW1lczp0YzpTQU1MOjIuMDphdHRybmFtZS1mb3JtYXQ6dW5zcGVjaWZpZWQiPg0KICAg\r\nICAgICAgICAgICAgIDxuczI6QXR0cmlidXRlVmFsdWU+UHVzaHA8L25zMjpBdHRyaWJ1dGVWYWx1\r\nZT4NCiAgICAgICAgICAgIDwvbnMyOkF0dHJpYnV0ZT4NCiAgICAgICAgICAgIDxuczI6QXR0cmli\r\ndXRlIE5hbWU9ImxuYW1lIiBOYW1lRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6\r\nYXR0cm5hbWUtZm9ybWF0OnVuc3BlY2lmaWVkIj4NCiAgICAgICAgICAgICAgICA8bnMyOkF0dHJp\r\nYnV0ZVZhbHVlPkFicm9sPC9uczI6QXR0cmlidXRlVmFsdWU+DQogICAgICAgICAgICA8L25zMjpB\r\ndHRyaWJ1dGU+DQogICAgICAgICAgICA8bnMyOkF0dHJpYnV0ZSBOYW1lPSJlbWFpbCIgTmFtZUZv\r\ncm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmF0dHJuYW1lLWZvcm1hdDp1bnNwZWNp\r\nZmllZCI+DQogICAgICAgICAgICAgICAgPG5zMjpBdHRyaWJ1dGVWYWx1ZT5wdXNocC5hYnJvbEB1\r\ncy5wd2MuY29tPC9uczI6QXR0cmlidXRlVmFsdWU+DQogICAgICAgICAgICA8L25zMjpBdHRyaWJ1\r\ndGU+DQogICAgICAgICAgICA8bnMyOkF0dHJpYnV0ZSBOYW1lPSJwd2NndWlkIiBOYW1lRm9ybWF0\r\nPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXR0cm5hbWUtZm9ybWF0OnVuc3BlY2lmaWVk\r\nIj4NCiAgICAgICAgICAgICAgICA8bnMyOkF0dHJpYnV0ZVZhbHVlPnBhYnJvbDAwMTwvbnMyOkF0\r\ndHJpYnV0ZVZhbHVlPg0KICAgICAgICAgICAgPC9uczI6QXR0cmlidXRlPg0KICAgICAgICA8L25z\r\nMjpBdHRyaWJ1dGVTdGF0ZW1lbnQ+DQogICAgPC9uczI6QXNzZXJ0aW9uPg0KPC9SZXNwb25zZT4=');
    parseSaml(tokenEditor.val(), function(samlData) {
           console.log(samlData);
      $(".saml-info").html(template(samlData));
    });
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