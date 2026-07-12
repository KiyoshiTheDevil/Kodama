"""Runtime preferences for outbound network resolution."""

import socket

from src.config import Config


# Captured once at import time, before any patching, so it always refers to the
# real resolver even if setup_ipv4_first() runs more than once.
_original_getaddrinfo = socket.getaddrinfo


AddressInfo = tuple[
    socket.AddressFamily,
    socket.SocketKind,
    int,
    str,
    tuple[int, bytes] | tuple[str, int] | tuple[str, int, int, int],
]


def _ipv4_first_getaddrinfo(
    host: bytes | str | None,
    port: bytes | int | str | None,
    family: int = 0,
    type: int = 0,
    proto: int = 0,
    flags: int = 0,
) -> list[AddressInfo]:
    results = _original_getaddrinfo(host, port, family, type, proto, flags)
    ipv4 = [entry for entry in results if entry[0] == socket.AF_INET]
    return ipv4 or results


def setup_ipv4_first(enabled: bool = Config.PREFER_IPV4) -> None:
    """Enable or disable IPv4-first resolution for outbound connections.

    On machines with broken/blackholed IPv6, Python's socket stack tries the
    IPv6 address first and stalls ~40s waiting for it to time out before falling
    back to IPv4 (unlike curl/browsers, it does not do Happy-Eyeballs). That made
    every outbound fetch — Google thumbnail CDN, YouTube Music — hang for ~40s.
    Filtering getaddrinfo to IPv4 removes the stall; harmless where IPv6 works.

    Restoring the original resolver when disabled lets the frontend change the
    preference without restarting the backend.
    """
    if not enabled:
        if socket.getaddrinfo is _ipv4_first_getaddrinfo:
            socket.getaddrinfo = _original_getaddrinfo
        print("[net] IPv4-first outbound resolution disabled.", flush=True)
        return

    socket.getaddrinfo = _ipv4_first_getaddrinfo
    print("[net] IPv4-first outbound resolution enabled.", flush=True)


class NetworkSettings:
    """Owns the user-toggleable outbound resolver preference."""

    def __init__(self, ipv4_first_enabled: bool = Config.PREFER_IPV4) -> None:
        self.ipv4_first_enabled = ipv4_first_enabled
        setup_ipv4_first(ipv4_first_enabled)

    def set_ipv4_first_enabled(self, enabled: bool) -> None:
        self.ipv4_first_enabled = enabled
        setup_ipv4_first(enabled)
