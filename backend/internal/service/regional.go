package service

import (
	"regexp"
	"strings"
	"time"
)

var (
	validDateFormatList = []string{"dmy_slash", "mdy_slash", "ymd_dash", "dmy_short"}
	validTimeFormatList = []string{"24h", "12h"}
	timezonePattern     = regexp.MustCompile(`^[A-Za-z0-9_+\-/]{1,64}$`)
)

func IsValidDateFormat(v string) bool {
	for _, f := range validDateFormatList {
		if f == v {
			return true
		}
	}
	return false
}

func IsValidTimeFormat(v string) bool {
	for _, f := range validTimeFormatList {
		if f == v {
			return true
		}
	}
	return false
}

// IsValidTimezone checks that the value is a well-formed IANA timezone name
// that Go's time package can load.
func IsValidTimezone(v string) bool {
	if !timezonePattern.MatchString(v) {
		return false
	}
	_, err := time.LoadLocation(v)
	return err == nil
}

func validDateFormatsList() string {
	quoted := make([]string, len(validDateFormatList))
	for i, k := range validDateFormatList {
		quoted[i] = "'" + k + "'"
	}
	return strings.Join(quoted, ", ")
}
