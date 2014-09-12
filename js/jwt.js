
// XXX Hack to prevent hextorstr function used by JWS send a string instead of
// a Word Array. On this way, no string decoding needs to take place and Crypto
// takes care of everything.
// Note that it should not affect the other algorithms as hextorstr is exclusively
// used on Hmac family (that invokes CryptoJS library).
window.hextorstr = function (c) {
  return window.CryptoJS.enc.Hex.parse(c);
};


//this is used to parse base64
function url_base64_decode(str) {
  var output = str.replace('-', '+').replace('_', '/');
  switch (output.length % 4) {
    case 0:
      break;
    case 2:
      output += '==';
      break;
    case 3:
      output += '=';
      break;
    default:
      throw 'Illegal base64url string!';
  }
  return window.atob(output); //polifyll https://github.com/davidchambers/Base64.js
}

window.decode = function (base64token) {
  var xml = null, error = null;
  try {
    xml = url_base64_decode(base64token);
  } catch (e) {
    error = e;
  }
  return {result: xml, error: error};
};


window.encode = function (data) {
  var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
    ac = 0,
    enc = '',
    tmp_arr = [];

  if (!data) {
    return data;
  }

  data = unescape(encodeURIComponent(data));

  do {
    // pack three octets into four hexets
    o1 = data.charCodeAt(i++);
    o2 = data.charCodeAt(i++);
    o3 = data.charCodeAt(i++);

    bits = o1 << 16 | o2 << 8 | o3;

    h1 = bits >> 18 & 0x3f;
    h2 = bits >> 12 & 0x3f;
    h3 = bits >> 6 & 0x3f;
    h4 = bits & 0x3f;

    // use hexets to index into b64, and append result to encoded string
    tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
  } while (i < data.length);

  enc = tmp_arr.join('');

  var r = data.length % 3;

  return (r ? enc.slice(0, r - 3) : enc) + '==='.slice(r || 3);
};

window.sign = function (header, payload, secret, isSecretBase64Encoded) {
  var value = '', error = null, headerAsJSON, payloadAsJSON;

  try {
    headerAsJSON = JSON.stringify(JSON.parse(header));
  } catch (e) {
    error = {result: null, error: {cause: e, who: ['header']}};
  }
  try {
    payloadAsJSON = JSON.stringify(JSON.parse(payload));
  } catch (e) {
    if (error) {
      error.error.who.push('payload');
    } else {
      error = {result: null, error: {cause: e, who: ['payload']}};
    }
  }

  if (error) {
    return error;
  }

  if (isSecretBase64Encoded) {
    try {
      secret = window.b64utob64(secret);
      secret = window.CryptoJS.enc.Base64.parse(secret).toString();
    } catch (e) {
      return {result: '', error: e};
    }
  } else {
    secret = window.CryptoJS.enc.Latin1.parse(secret).toString();
  }

  try {
    value = KJUR.jws.JWS.sign(null, headerAsJSON, payloadAsJSON, secret);
  } catch (e) {
    error = e;
  }

  return {result: value, error: error};
};

window.isValidBase64String = function (s) {
  try {
    s = window.b64utob64(s);
    window.CryptoJS.enc.Base64.parse(s).toString();
    return true;
  } catch (e) {
    return false;
  }
};

window.verify = function (value, secret, isSecretBase64Encoded) {
  var result = '', error = null;

  if (isSecretBase64Encoded) {
    try {
      secret = window.b64utob64(secret);
      secret = window.CryptoJS.enc.Base64.parse(secret).toString();
    } catch (e) {
      return {result: '', error: e};
    }
  } else {
    secret = window.CryptoJS.enc.Latin1.parse(secret).toString();
  }

  try {
    result = KJUR.jws.JWS.verify(value, secret);
  } catch (e) {
    error = e;
  }

  return {result: result, error: error};
};
