package model

// ReverseGeocode is the human-readable place a pair of coordinates sits in.
// Name is what a card or saved place should be labelled with; Address is the
// fuller description, used to pre-fill a saved place's address.
type ReverseGeocode struct {
	Name    string `json:"name"`
	Address string `json:"address,omitempty"`
}
