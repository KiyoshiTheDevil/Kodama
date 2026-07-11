"""Parse browser authentication headers saved from cURL or plain text."""

import re


class ProfileAuthHeaders:
    """Converts copied browser request headers into a normalized mapping."""

    @staticmethod
    # Old server.py: parse_curl_to_dict
    def parse_curl_command(curl_command):
        """Extract cookies and ``-H`` headers from bash or Windows cURL input."""
        headers = {}

        curl_command = re.sub(r"\^\s*\n\s*", " ", curl_command)
        curl_command = curl_command.replace('^\\"', "\x00DQ\x00")
        curl_command = curl_command.replace('^"', '"')
        curl_command = curl_command.replace("\x00DQ\x00", '"')
        curl_command = curl_command.replace("^%^", "%")
        curl_command = curl_command.replace("^&", "&")

        cookie_match = re.search(r'\s-b\s+"([^"]*)"', curl_command)
        if cookie_match:
            headers["cookie"] = cookie_match.group(1)

        for match in re.finditer(r'-H\s+"([^"]+?)"(?:\s|$)', curl_command):
            ProfileAuthHeaders._add_header(headers, match.group(1))
        for match in re.finditer(r"-H\s+'([^']+)'", curl_command):
            ProfileAuthHeaders._add_header(headers, match.group(1))

        print(f"[i] Parsed {len(headers)} headers: {list(headers.keys())}", flush=True)
        return headers

    @staticmethod
    # Old server.py: parse_raw_headers_to_dict
    def parse_raw_headers(raw_headers):
        """Extract ``Header: value`` lines into a normalized mapping."""
        headers = {}
        for line in raw_headers.splitlines():
            ProfileAuthHeaders._add_header(headers, line)
        return headers

    @staticmethod
    def _add_header(headers, header):
        if ": " not in header:
            return
        key, _, value = header.partition(": ")
        headers[key.lower().strip()] = value.strip()
