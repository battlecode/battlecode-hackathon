import os
import socket

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.connect(("localhost", 6147))
    print("Internal network connected")
except:
    print("Internal connection failed.")

try:
    s.connect(("172.17.0.1",6147))
    print("Forwarded network connected")
except:
    print("Forwarded network failed")
