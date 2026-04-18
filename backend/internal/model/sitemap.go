package model

import "time"

// SitemapURL represents a single <url> entry in the sitemap XML.
type SitemapURL struct {
	Loc        string  `xml:"loc"`
	LastMod    *string `xml:"lastmod,omitempty"`
	ChangeFreq *string `xml:"changefreq,omitempty"`
	Priority   *string `xml:"priority,omitempty"`
}

// SitemapURLSet is the root element of a sitemap XML document.
type SitemapURLSet struct {
	XMLName string       `xml:"urlset"`
	XMLNS   string       `xml:"xmlns,attr"`
	URLs    []SitemapURL `xml:"url"`
}

// SitemapSubmission records a ping to a search engine.
type SitemapSubmission struct {
	ID           string    `json:"id"`
	Engine       string    `json:"engine"`
	URL          string    `json:"url"`
	StatusCode   *int16    `json:"status_code"`
	ResponseBody *string   `json:"response_body,omitempty"`
	Error        *string   `json:"error,omitempty"`
	SubmittedBy  string    `json:"submitted_by"`
	CreatedAt    time.Time `json:"created_at"`
}

// SitemapStats summarises the dynamic content available for the sitemap.
type SitemapStats struct {
	StaticPages   int `json:"static_pages"`
	PublicUsers   int `json:"public_users"`
	PublicLeagues int `json:"public_leagues"`
	PublicClubs   int `json:"public_clubs"`
	TotalURLs     int `json:"total_urls"`
}

// SitemapPingRequest is the admin request body to trigger a ping.
type SitemapPingRequest struct {
	Engines []string `json:"engines"` // e.g. ["google","bing","indexnow"]
}

// IndexNowKeyInfo reports the key details currently used by sitemap pings.
type IndexNowKeyInfo struct {
	Key         string `json:"key"`
	KeyLocation string `json:"key_location"`
	Source      string `json:"source"` // "configured" or "generated"
}
