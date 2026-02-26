<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>XML Sitemap - DictionarulTau.ro</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <style type="text/css">
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #0d4f4f; border-bottom: 3px solid #e07850; padding-bottom: 10px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:hover { background: #f9fafb; }
    a { color: #0d4f4f; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .count { background: #e07850; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>XML Sitemap</h1>
  <xsl:choose>
    <xsl:when test="sitemap:sitemapindex">
      <p>Acest sitemap index contine <span class="count"><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/></span> sitemap-uri.</p>
      <table>
        <tr><th>Sitemap</th><th>Ultima Modificare</th></tr>
        <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
          <tr>
            <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
            <td><xsl:value-of select="substring(sitemap:lastmod, 1, 10)"/></td>
          </tr>
        </xsl:for-each>
      </table>
    </xsl:when>
    <xsl:otherwise>
      <p>Acest sitemap contine <span class="count"><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></span> URL-uri.</p>
      <table>
        <tr><th>URL</th><th>Imagini</th><th>Ultima Modificare</th></tr>
        <xsl:for-each select="sitemap:urlset/sitemap:url">
          <tr>
            <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
            <td><xsl:value-of select="count(image:image)"/></td>
            <td><xsl:value-of select="substring(sitemap:lastmod, 1, 10)"/></td>
          </tr>
        </xsl:for-each>
      </table>
    </xsl:otherwise>
  </xsl:choose>
</body>
</html>
</xsl:template>
</xsl:stylesheet>