'''Play battlecode hackathon games.'''

import socket
import ujson as json
import math
import io
import time

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

        if 'cooldownEnd' in data:
            self.cooldown_end = data['cooldownEnd']
        else: 
            self.cooldown_end = self._game.turn

        if 'holdingEnd' in data:
            self.holding_end = data['holdingEnd']
        else:
            self.holding_end = self._game.turn

        if 'heldBy' in data:
            self.held_by = self._game.entities[data['heldBy']]
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

    def __repr__(self):
        return str(self)

    # TODO: more methods

class Map(object):
    '''A game map.'''
    def __init__(self, height, width, tiles, sector_size):
        self.height = height
        self.width = width
        self.tiles = tiles
        self.sector_size = sector_size
    
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

    def __repr__(self):
        return str(self)

class Game(object):
    '''A game that's currently running.'''

    def __init__(self, name, server=('localhost', 6147)):
        '''Connect to the server and wait for the first turn.'''

        assert isinstance(name, str) \
               and len(name) > 5 and len(name) < 100, \
               'invalid team name: '+unicode(name)

        # setup connection
        conn = socket.socket()
        # conn.settimeout(5)
        conn.connect(server)

        self._socket = conn.makefile('rwb', 4096)

        # send login command
        self._send({
            'command': 'login',
            'name': name,
        })

        # handle login response
        resp = self._recv()
        assert resp['command'] == 'loginConfirm'

        team_id = resp['teamID']

        # wait for the start command
        start = self._recv()
        assert start['command'] == 'start'

        self.teams = {}
        for team in start['teams']:
            team = Team(team['teamID'], team['name'])
            self.teams[team.id] = team

        self.team = self.teams[team_id]

        map = start['map']
        self.map = Map(map['width'], map['height'], map['tiles'], map['sectorSize'])

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

        message = json.dumps(message)
        self._socket.write(message.encode('utf-8'))
        self._socket.write(b'\n')
        self._socket.flush()

    def _recv(self):
        '''Receive a '\n'-delimited JSON message from the server.
        See server/src/schema.ts for valid messages.'''
        # next() reads lines from a file object
        message = next(self._socket)

        result = json.loads(message)

        if "command" not in result:
            raise BattlecodeError("Unknown result: "+str(result))
        if result['command'] == 'error':
            raise BattlecodeError(result["reason"])

        return result

    def _finish(self):
        self._socket.close()
        self._socket = None

    def next_turn(self):
        '''Submit queued actions, and wait for our next turn.'''
        self._submit_turn()
        self._await_turn()

    def _await_turn(self):
        while True:
            turn = self._recv()
            assert turn['command'] == 'nextTurn'
            self.turn = turn['turn']
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

            if 'winner' in turn:
                self._finish()

            if turn['nextTeam'] == self.team.id:
                return

    def _submit_turn(self):
        self._send({
            'command': 'makeTurn',
            'turn': self.turn,
            'actions': self._action_queue
        })
        del self._action_queue[:]

    def _queue(self, action):
        self._action_queue.append(action)

class BattlecodeError(Exception):
    def __init__(self, *args, **kwargs):
        super(BattlecodeError, self).__init__(self, *args, **kwargs)