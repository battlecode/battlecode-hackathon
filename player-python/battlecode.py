'''Play battlecode hackathon games.'''

import socket
import json
import math
import io

# pylint: disable = too-many-instance-attributes, invalid-name, W0622, W0212

THROWER = 'thrower'
HEDGE = 'hedge'
STATUE = 'statue'

GRASS = 'G'
DIRT = 'D'

class Entity(object):
    '''
    An entity in the world: a Thrower, Hedge, or Statue.

    Do not modify the properties of this object; it won't do anything.
    Instead, call entity.queue_move() and other methods to tell the game to do something
    next turn.
    '''

    def __init__(self, game):
        self._game = game

        self.id = None
        self.type = None
        self.location = None
        self.team = None
        self.hp = None
        self.cooldown_end = None
        self.holding_end = None
        self.held_by = None
        self.holding = None
    
    def _update(self, data):
        self.id = data['id']
        self.type = data['type']
        self.team = self._game.teams[data['team']]
        self.hp = data['hp']
        if 'location' in data:
            self.location = Location(data['location']['x'], data['location']['y'])
        else:
            self.location = None

        if 'cooldown_end' in data:
            self.cooldown_end = data['cooldown_end']
        else: 
            self.cooldown_end = self._game.turn

        if 'holding_end' in data:
            self.holding_end = data['holding_end']
        else:
            self.holding_end = self._game.turn

        if 'held_by' in data:
            self.held_by = self._game.entities[data['held_by']]
        else:
            self.held_by = None

        if 'holding' in data:
            self.holding = self._game.entities[data['holding']]
        else:
            self.holding = None

    @property
    def cooldown(self):
        '''The number of turns left in this entity's cooldown.'''
        if self.cooldown_end is None:
            return 0
        return max(self._game.turn - self.cooldown_end, 0)

    @property
    def turns_until_drop(self):
        '''The number of turns until this entity drops its held entity.'''
        return max(self._game.turn - self.holding_end, 0)

    def queue_move(self, location):
        '''Queues a move, so that this object will move in the next turn.'''
        assert isinstance(location, Location), "Can't move to a non-location!"
        self._game._queue({
            'action': 'move',
            'id': self.id,
            'loc': {
                'x': location.x,
                'y': location.y
            }
        })

    def queue_disintegrate(self):
        '''Queues a disintegration, so that this object will disintegrate in the next turn.'''
        self._game._queue({
            'action': 'disintegrate',
            'id': self.id
        })

class Location(object):
    '''An x,y location in the world.'''

    def __init__(self, x, y):
        assert isinstance(x, int) or math.floor(x) == x, 'non-integer location: '+str(x)
        assert isinstance(y, int) or math.floor(y) == y, 'non-integer location: '+str(y)

        self.x = int(x)
        self.y = int(y)

    def __str__(self):
        return '<{},{}>'.format(self.x, self.y)

    # TODO: more methods

class Map(object):
    '''A game map.'''
    def __init__(self, height, width, tiles):
        self.height = height
        self.width = width
        self.tiles = tiles
    
    def tile_at(self, location):
        '''Get the tile at a location.'''
        return self.tiles[location.y][location.x]

class Team(object):
    '''Information about a team.'''

    def __init__(self, id, name):
        self.id = id
        self.name = name
    
    def __eq__(self, other):
        return isinstance(other, Team) and other.id == self.id

    def __str__(self):
        return '<team "{}" ({})>'.format(self.name, self.id)

class _LineIO(io.RawIOBase):
    '''Magic class to split an input socket into lines.'''
    def __init__(self, sock):
        self.sock = sock

    def read(self, sz=-1):
        if (sz == -1): sz=0x7FFFFFFF
        return self.sock.recv(sz)

    def seekable(self):
        return False

class Game(object):
    '''A game that's currently running.'''

    def __init__(self, team_name, server=('localhost', 6172)):
        '''Connect to the server and wait for the first turn.'''

        assert isinstance(team_name, str) \
               and len(team_name) > 5 and len(team_name) < 100, \
               'invalid team name: '+unicode(team_name)

        # setup connection
        self._socket = socket.socket()
        #self._socket.settimeout(1) # second
        self._socket.connect(server)
        self._lineio = _LineIO(self._socket)

        # send login command
        self._send({
            'command': 'login',
            'name': team_name
        })

        # handle login response
        resp = self._recv()
        assert resp['command'] == 'login_confirm'
        assert resp['name'] == team_name

        team_id = resp['id']

        # wait for the start command
        start = self._recv()
        assert start['command'] == 'start'

        self.teams = {}
        for team in start['teams']:
            team = Team(**team)
            self.teams[team.id] = team

        self.team = self.teams[team_id]

        self.map = Map(**start['map'])

        # initialize other state
        self.turn = 0
        self.entities = {}

        self._action_queue = []

        # wait for our first turn
        # TODO: run messaging logic on another thread?
        self._next_team = None
        self._await_turn()

    def _send(self, message):
        '''Send a dictionary as JSON to the server.
        See server/src/schema.ts for valid messages.'''

        message_b = json.dumps(message).encode('utf-8')
        self._socket.sendall(message_b)
        self._socket.send(b'\n')

    def _recv(self):
        '''Receive a '\n'-delimited JSON message from the server.
        See server/src/schema.ts for valid messages.'''
        while True:
            message = self._lineio.readline()
            if len(message) > 0:
                break

        result = json.loads(message)
        return result

    def next_turn(self):
        '''Submit queued actions, and wait for our next turn.'''
        self._submit_turn()
        self._await_turn()

    def _await_turn(self):
        while True:
            turn = self._recv()
            assert turn['command'] == 'next_turn'
            if 'winner' in turn:
                # TODO
                raise Exception('Game finished')

            for dead in turn['dead']:
                del self.entities[dead]

            for entity in turn['changed']:
                id = entity['id']
                if id not in self.entities:
                    self.entities[id] = Entity(self)
                self.entities[id]._update(entity)

            if turn['next_team'] == self.team.id:
                return

    def _submit_turn(self):
        self._send({
            'command': 'make_turn',
            'actions': self._action_queue
        })
        del self._action_queue[:]

    def _queue(self, action):
        self._action_queue.append(action)

