import socket
import json

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("localhost", 6172))

class Entity(object): 
    def __init__(**kwargs):
        self.id = kwargs["id"]
        self.type = kwargs["type"]
        self.location = kwargs["location"]
        self.teamid = kwargs["teamid"]
        self.hp = kwargs["hp"]
        self.cooldown_end = kwargs["cooldown_end"]  
        self.helpless = kwargs["helpless"]
        self.holding = kwargs["holding"]
        self.holding_end = kwargs{"holding_end"}
    

class World(object):
    def __init_(**kwargs):
        self.height = kwargs["height"]
        self.width = kwargs["width"]
        self.tiles = kwargs["tiles"]

class Team(object):
    def __init__(**kwargs):
        self.id = kwargs["id"]
        self.name = kwargs["name"]


class Game(object):
    def __init__():
    
