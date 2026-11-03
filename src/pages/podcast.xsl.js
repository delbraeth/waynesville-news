// Browser view of /podcast.xml. Podcast apps ignore this stylesheet and read the
// raw feed; a person who clicks the feed link in a browser sees a normal page
// with Apple Podcasts / Spotify buttons and the latest episodes instead of XML.
import audioCfg from "../data/audio.json";

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export async function GET() {
  const pod = audioCfg.podcast ?? {};
  const apps = [
    pod.apple && { href: pod.apple, label: "Apple Podcasts" },
    pod.spotify && { href: pod.spotify, label: "Spotify" },
  pod.youtube && { href: pod.youtube, label: "YouTube" },
  ].filter(Boolean);
  const buttons = apps.map((a) => `<a class="btn" href="${esc(a.href)}">Listen on ${esc(a.label)}</a>`).join("\n          ");

  const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/rss/channel">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="title"/></title>
        <style>
          :root { --paper:#fbf9f5; --paper-2:#f4f0e8; --ink:#1a1712; --muted:#776d60; --rule:#e5ddce; --accent:#9e2b25; --link:#1c4f74; }
          @media (prefers-color-scheme: dark) { :root { --paper:#16130f; --paper-2:#211d18; --ink:#efe9dd; --muted:#a89d8e; --rule:#3a332b; --accent:#d9574f; --link:#8fbbe0; } }
          * { box-sizing: border-box; }
          body { margin:0; background:var(--paper); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; line-height:1.5; }
          main { max-width:44rem; margin:0 auto; padding:2rem 16px 3rem; }
          a { color:var(--link); }
          .head { display:flex; gap:1.25rem; align-items:center; flex-wrap:wrap; }
          .head img { width:140px; height:140px; border-radius:10px; border:1px solid var(--rule); }
          h1 { font-family:Georgia,"Times New Roman",serif; font-size:1.9rem; line-height:1.15; margin:0 0 .4rem; }
          .muted { color:var(--muted); }
          .btns { display:flex; flex-wrap:wrap; gap:.6rem; margin:1.25rem 0 .5rem; }
          .btn { display:inline-block; background:var(--accent); color:#fff; text-decoration:none; padding:.6rem 1rem; border-radius:6px; font-weight:600; }
          .note { font-size:.9rem; background:var(--paper-2); border:1px solid var(--rule); border-radius:6px; padding:.75rem 1rem; margin:1rem 0 2rem; }
          code { word-break:break-all; }
          h2 { font-size:1.1rem; border-bottom:1px solid var(--rule); padding-bottom:.4rem; margin-top:2rem; }
          .ep { padding:1rem 0; border-bottom:1px solid var(--rule); }
          .ep h3 { font-size:1.05rem; margin:0 0 .25rem; }
          .ep audio { width:100%; margin-top:.5rem; }
        </style>
      </head>
      <body>
        <main>
          <div class="head">
            <img src="/podcast-cover.jpg" alt=""/>
            <div>
              <h1><xsl:value-of select="title"/></h1>
              <p class="muted" style="margin:0">From <a href="/">Waynesville News</a> · a new episode every morning</p>
            </div>
          </div>
          <p><xsl:value-of select="description"/></p>
          <div class="btns">
          ${buttons}
          </div>
          <p class="note">This page is the podcast feed. To follow along in another podcast app, search for “Waynesville News Daily Brief” or paste this address into the app: <code>https://waynesville.news/podcast.xml</code></p>
          <h2>Recent episodes</h2>
          <xsl:for-each select="item[position() &lt;= 10]">
            <div class="ep">
              <h3><a href="{link}"><xsl:value-of select="title"/></a></h3>
              <div class="muted" style="font-size:.85rem"><xsl:value-of select="substring(pubDate, 1, 16)"/> · <xsl:value-of select="itunes:duration"/></div>
              <audio controls="controls" preload="none" src="{enclosure/@url}"></audio>
            </div>
          </xsl:for-each>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`;
  return new Response(xsl, { headers: { "Content-Type": "text/xsl; charset=utf-8" } });
}
