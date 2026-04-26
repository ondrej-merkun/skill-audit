import socket


def test_socket_fixture_payload():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    assert sock.family == socket.AF_INET
