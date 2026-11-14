const punycode = require('punycode/')

const searchEngine = require('util/searchEngine.js')
const hosts = require('./hosts.js')
const httpsTopSites = require('../../ext/httpsUpgrade/httpsTopSites.json')
const publicSuffixes = require('../../ext/publicSuffixes/public_suffix_list.json')

function removeWWW (domain) {
  return (domain.startsWith('www.') ? domain.slice(4) : domain)
}
function removeTrailingSlash (url) {
  return (url.endsWith('/') ? url.slice(0, -1) : url)
}

var urlParser = {
  validIP4Regex: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/i,
  validDomainRegex: /^(?!-)(?:.*@)*?([a-z0-9-._]+[a-z0-9]|\[[:a-f0-9]+\])/i,
  unicodeRegex: /[^\u0000-\u00ff]/,
  removeProtocolRegex: /^(https?|file):\/\//i,
  protocolRegex: /^[a-z0-9]+:\/\//, // URI schemes can be alphanum
  /* Yggdrasil addresses live in 200::/7, i.e. the first hextet is 02xx or 03xx */
  yggIPv6Regex: /^(?:2[0-9a-f]{2}|3[0-9a-f]{2})(?::[0-9a-f]{1,4}){2,7}$/i,
  yggDomainRegex: /\.ygg$/i,
  isURL: function (url) {
    return urlParser.protocolRegex.test(url) || url.indexOf('about:') === 0 || url.indexOf('chrome:') === 0 || url.indexOf('data:') === 0
  },
  /* true for bare Yggdrasil IPv6 literals like 201:a8b5::1 or [201:a8b5::1]:80 */
  isYggLiteral: function (url) {
    var host = url
    /* strip path/query */
    var cut = Math.min.apply(null, ['/', '?', '#'].map(function (c) {
      var i = host.indexOf(c)
      return i === -1 ? host.length : i
    }))
    host = host.slice(0, cut)
    if (host.startsWith('[') && host.indexOf(']') > 0) {
      host = host.slice(1, host.indexOf(']'))
    }
    return urlParser.yggIPv6Regex.test(host)
  },
  isYggHost: function (url) {
    var domain = urlParser.getDomain(url)
    return urlParser.yggDomainRegex.test(domain) || (domain.startsWith('[') && urlParser.yggIPv6Regex.test(domain.slice(1, -1)))
  },
  isPossibleURL: function (url) {
    if (urlParser.isURL(url)) {
      return true
    } else {
      if (url.indexOf(' ') >= 0) {
        return false
      }
    }

    const domain = urlParser.getDomain(url)
    return hosts.includes(domain)
  },
  removeProtocol: function (url) {
    if (!urlParser.isURL(url)) {
      return url
    }

    /*
    Protocols removed: http:/https:/file:
    chrome:, about:, data: protocols intentionally not removed
    */
    return url.replace(urlParser.removeProtocolRegex, '')
  },
  isURLMissingProtocol: function (url) {
    return !urlParser.protocolRegex.test(url)
  },
  parse: function (url) {
    url = url.trim() // remove whitespace common on copy-pasted url's

    if (!url) {
      return 'about:blank'
    }

    if (url.indexOf('view-source:') === 0) {
      var realURL = url.replace('view-source:', '')

      return 'view-source:' + urlParser.parse(realURL)
    }

    if (url.startsWith('min:') && !url.startsWith('min://app/')) {
      // convert shortened min:// urls to full ones
      const urlChunks = url.split('?')[0].replace(/min:(\/\/)?/g, '').split('/')
      const query = url.split('?')[1]
      return 'min://app/pages/' + urlChunks[0] + (urlChunks[1] ? urlChunks.slice(1).join('/') : '/index.html') + (query ? '?' + query : '')
    }

    // Yggdrasil IPv6 literal without a protocol -> http://[...]
    if (urlParser.isYggLiteral(url)) {
      if (url.startsWith('[')) {
        return 'http://' + url
      }
      var hostPart = url.split(/[/?#]/)[0]
      var rest = url.slice(hostPart.length)
      return 'http://[' + hostPart + ']' + rest
    }

    // if the url starts with a (supported) protocol
    if (urlParser.isURL(url)) {
      if (!urlParser.isInternalURL(url) && url.startsWith('http://')) {
        // prefer HTTPS over HTTP, but never upgrade Yggdrasil sites
        const noProtoURL = urlParser.removeProtocol(url)

        if (!urlParser.isYggHost(noProtoURL) && urlParser.isHTTPSUpgreadable(noProtoURL)) {
          return 'https://' + noProtoURL
        }
      }
      return url
    }

    // if the url doesn't have any protocol and it's a valid domain
    if (urlParser.isURLMissingProtocol(url) && urlParser.validateDomain(urlParser.getDomain(url))) {
      if (urlParser.isHTTPSUpgreadable(url)) { // check if it is HTTPS-able
        return 'https://' + url
      }
      return 'http://' + url
    }

    // else, do a search
    return searchEngine.getCurrent().searchURL.replace('%s', encodeURIComponent(url))
  },
  basicURL: function (url) {
    return removeWWW(urlParser.removeProtocol(removeTrailingSlash(url)))
  },
  prettyURL: function (url) {
    try {
      var urlOBJ = new URL(url)
      return removeWWW(removeTrailingSlash(urlOBJ.hostname + urlOBJ.pathname))
    } catch (e) { // URL constructor will throw an error on malformed URLs
      return url
    }
  },
  isInternalURL: function (url) {
    return url.startsWith('min://')
  },
  getSourceURL: function (url) {
    // converts internal URLs (like the PDF viewer or the reader view) to the URL of the page they are displaying
    if (urlParser.isInternalURL(url)) {
      var representedURL
      try {
        representedURL = new URLSearchParams(new URL(url).search).get('url')
      } catch (e) {}
      if (representedURL) {
        return representedURL
      } else {
        try {
          var pageName = url.match(/\/pages\/([a-zA-Z]+)\//)
          var urlObj = new URL(url)
          if (pageName) {
            return 'min://' + pageName[1] + urlObj.search
          }
        } catch (e) {}
      }
    }
    return url
  },
  getFileURL: function (path) {
    if (window.platformType === 'windows') {
      // convert backslash to forward slash
      path = path.replace(/\\/g, '/')
      // https://blogs.msdn.microsoft.com/ie/2006/12/06/file-uris-in-windows/

      // UNC path?
      if (path.startsWith('//')) {
        return encodeURI('file:' + path)
      } else {
        return encodeURI('file:///' + path)
      }
    } else {
      return encodeURI('file://' + path)
    }
  },
  getDomain: function (url) {
    url = urlParser.removeProtocol(url)
    return url.split(/[/:]/)[0].toLowerCase()
  },
  // primitive domain validation based on RFC1034
  validateDomain: function (domain) {
    domain = urlParser.unicodeRegex.test(domain)
      ? punycode.toASCII(domain)
      : domain

    if (!urlParser.validDomainRegex.test(domain)) {
      return false
    }
    const cleanDomain = RegExp.$1
    if (cleanDomain.length > 255) {
      return false
    }

    // is domain an ipv4/6, a .ygg name, or known hostname?
    if (urlParser.yggDomainRegex.test(cleanDomain) ||
        (urlParser.validIP4Regex.test(cleanDomain) || (cleanDomain.startsWith('[') && cleanDomain.endsWith(']'))) ||
        hosts.includes(cleanDomain)) {
      return true
    }
    // it has a public suffix?
    return publicSuffixes.find(s => cleanDomain.endsWith(s)) !== undefined
  },
  isHTTPSUpgreadable: function (url) {
    if (urlParser.isYggHost(url)) {
      return false
    }
    // TODO: parse and remove all subdomains, only leaving parent domain and tld
    const domain = removeWWW(urlParser.getDomain(url)) // list has no subdomains

    return httpsTopSites.includes(domain)
  },
  removeTextFragment: function (url) {
    try {
      var parsedURL = new URL(url)
      if (parsedURL.hash.startsWith('#:~:text=')) {
        parsedURL.hash = ''
        return parsedURL.toString()
      }
    } catch (e) {}
    return url
  }
}

module.exports = urlParser
