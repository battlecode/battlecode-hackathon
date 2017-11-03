from __future__ import print_function

'''Play battlecode hackathon games.'''

from enum import Enum
import socket
import math
import io
import time
import os
try:
    import cPickle as pickle
except:
    import pickle
try:
    import ujson as json
except:
    import json

# pylint: disable = too-many-instance-attributes, invalid-name

THROWER = 'thrower'
HEDGE = 'hedge'
STATUE = 'statue'

GRASS = 'G'
DIRT = 'D'

# terminal formatting
_TERM_RED = '\033[31m'
_TERM_END = '\033[0m'

def direction_rotate_degrees_clockwise(direction, degrees):
    if __debug__:
        assert (degrees %45 == 0), "Rotation must be a multiple of 45 degrees"

    directions = list(Direction.all())
    return directions[direction.value+degrees//45%8]

class Direction(Enum):
    ''' This is an enum for direction '''
    NORTH =      ( 0,  1)
    NORTH_EAST = ( 1,  1)
    EAST =       ( 1,  0)
    SOUTH_EAST = ( 1, -1)
    SOUTH =      ( 0, -1)
    SOUTH_WEST = (-1, -1)
    WEST =       (-1,  0)
    NORTH_WEST = (-1,  1)

    def __init__(self, dx, dy):
        self.dx = dx
        self.dy = dy
    
    @staticmethod
    def from_delta(dx, dy):
        if dx < 0:
            if dy < 0:
                return Direction.SOUTH_WEST
            elif dy == 0:
                return Direction.WEST
            elif dy > 0:
                return Direction.NORTH_WEST
        elif dx == 0:
            if dy < 0:
                return Direction.SOUTH
            elif dy == 0:
                raise BattlecodeError("not a valid delta: "+str(dx)+","+str(dy))
            elif dy > 0:
                return Direction.NORTH
        elif dx > 0:
            if dy < 0:
                return Direction.SOUTH_EAST
            elif dy == 0:
                return Direction.EAST
            elif dy > 0:
                return Direction.NORTH_EAST
    
    @staticmethod
    def all():
        for direction in Direction:
            yield direction
    
class Entity(object):
    '''
    An entity in the world: a Thrower, Hedge, or Statue.

    Do not modify the properties of this object; it won't do anything
    Instead, call entity.queue_move() and other methods to tell the game to do something
    next turn.
    '''

    def __init__(self, state):
        self._state = state

        self.id = None
        self.type = None
        self.location = None
        self.team = None
        self.hp = None
        self.cooldown_end = None
        self.holding_end = None
        self.held_by = None
        self.holding = None

    def __str__(self):
        contents = '<id:{},type:{},team:{},location:{}'.format(
            self.id, self.type, self.team, self.location)
        if self.cooldown > 0:
            contents += ',cooldown:{}'.format(self.cooldown)
        if self.holding is not None:
            contents += ',holding:{},holding_end:{}'.format(self.holding.id, self.holding_end)
        if self.held_by is not None:
            contents += ',held_by:{}'.format(self.held_by.id)
        contents += '>'
        return contents

    def __repr__(self):
        return str(self)

    def __eq__(self, other):
        if not isinstance(other, Entity):
            return False
        if self.holding is not None and other.holding is not None \
            and self.holding.id != other.holding.id:
            return False
        if self.held_by is not None and other.held_by is not None \
            and self.held_by.id != other.held_by.id:
            return False

        return self.id == other.id \
            and self.type == other.type \
            and self.location == other.location \
            and self.team == other.team \
            and self.hp == other.hp \
            and self.cooldown_end == other.cooldown_end \
            and self.holding_end == other.holding_end
    
    def __ne__(self, other):
        return not (self == other)

    def _update(self, data):
        if self.location in self._state.map._occupied and \
            self._state.map._occupied[self.location] == self.id:
            del self._state.map._occupied[self.location]

        if __debug__:
            if self.id is not None:
                assert data['id'] == self.id
            if self.type is not None:
                assert data['type'] == self.type
            if self.team is not None:
                assert data['teamID'] == self.team.id

        self.id = data['id']
        self.type = data['type']
        self.team = self._state.teams[data['teamID']]
        self.hp = data['hp']
        self.location = Location(data['location']['x'], data['location']['y'])

        if 'cooldownEnd' in data:
            self.cooldown_end = data['cooldownEnd']
        else: 
            self.cooldown_end = None

        if 'holdingEnd' in data:
            self.holding_end = data['holdingEnd']
        else:
            self.holding_end = None

        if 'heldBy' in data:
            self.held_by = self._state.entities[data['heldBy']]
        else:
            self.held_by = None
            self._state.map._occupied[self.location] = self.id

        if 'holding' in data:
            self.holding = self._state.entities[data['holding']]
        else:
            self.holding = None

    @property
    def cooldown(self):
        '''The number of turns left in this entity's cooldown.'''
        if self.cooldown_end is None:
            return 0

        cooldown = max(self._state.turn - self.cooldown_end, 0)

        return cooldown

    @property
    def turns_until_drop(self):
        '''The number of turns until this entity drops its held entity.'''

    @property
    def is_robot(self):
        return self.type == THROWER

    @property
    def is_statue(self):
        return self.type == STATUE

    @property
    def is_holding(self):
        return self.holding != None

    @property
    def is_held(self):
        return self.held_by != None

    @property
    def can_act(self):
        ''' Returns true if this is a robot with no cooldown. If either is
        false then this entity cannot perform any actions this turn.'''
        return self.cooldown == 0 and self.is_robot and self.held_by is None

    @property
    def can_be_picked(self):
        ''' Returns true if the entitiy can be picked up. Otherwise returns
        false'''

        # Possible change this to
        return self.is_robot and not self.is_holding

    @property
    def can_throw(self):
        return self.is_holding

    def can_move(self, direction):
        ''' Returns true if the robot can move in a given direction. False
        otherwise.'''

        if not self.can_act:
            return False

        location = self.location.adjacent_location_in_direction(direction)
        on_map = self._state.map.location_on_map(location)
        entity = self._state.entity_at_location(location)
        occupied = location in self._state.map._occupied

        if ((not on_map) or (entity is not None) or occupied):
            return False
        return True

    def can_build(self, direction):
        return self.can_move(direction)

    def can_pickup(self, entity):
        ''' Returns true if entity can pickup another entity in given
        direction. Otherwise returns False.'''

        if __debug__:
            assert isinstance(entity, Entity), 'Parameter ' + str(entity) + \
                "is not an entity"
            assert (self != entity), "You can't pickup yourself"

        if entity == self:
            return False

        if not self.can_act:
            return False

        distance_to = self.location.distance_to_squared(entity.location)
        if entity == None or not entity.can_be_picked or not distance_to <=2:
            return False
        else:
            return True

    def queue_move(self, direction):
        '''Queues a move, so that this object will move one square in given
        direction in the next turn.'''

        if __debug__:
            location = self.location.adjacent_location_in_direction(direction)
            assert isinstance(location, Location), "Can't move to a non-location!"
            assert self.can_move(direction), "Invalid move cannot move in given direction"

        self._state._queue({
            'action': 'move',
            'id': self.id,
            'dx': direction.dx,
            'dy': direction.dy
        })
        if self._state.speculate:
            if self.can_move(direction):
                del self._state.map._occupied[self.location]
                self.location = self.location.adjacent_location_in_direction(direction)
                self._state.map._occupied[self.location] = self.id

    def queue_build(self, direction):
        '''Queues a move, so that this object will move one square in given
        direction in the next turn.'''
        location = self.location.adjacent_location_in_direction(direction)

        if __debug__:
            assert isinstance(location, Location), "Can't move to a non-location!"
            assert self.can_move(direction), "Invalid move cannot move in given direction"

        self._state._queue({
            'action': 'build',
            'id': self.id,
            'dx': direction.dx,
            'dy': direction.dy
        })

    def queue_move_location(self, location):
        '''Queues a move, so that this object will move in the next turn.'''
        if __debug__:
            assert isinstance(location, Location), "Can't move to a non-location!"
            assert self.location.distance_to_squared(location) <= 2

        direction = self.location.direction_to(location)

        self.queue_move(direction)

    def queue_disintegrate(self):
        '''Queues a disintegration, so that this object will disintegrate in the next turn.'''
        self._state._queue({
            'action': 'disintegrate',
            'id': self.id
        })

    def queue_throw(self, direction):
        '''Queues a move, so that this object will throw held object one square
        in given direction in the next turn.'''
        if __debug__:
            assert self.holding != None, "Not Holding anything"

        self._state._queue({
            'action': 'throw',
            'id': self.id,
            'dx': direction.dx,
            'dy': direction.dy
        })

    def queue_pickup(self, entity):
        if __debug__:
            assert self.can_pickup(entity), "Invalid Pickup Command"

        self._state._queue({
            'action': 'pickup',
            'id': self.id ,
            'pickupID': entity.id
        })

    def entities_within_distance(self, distance, include_held=False):
        '''Entities within a certain distance'''
        for entity in self._state.entities.values():
            if entity is self:
                continue
            if not include_held and entity.held_by is not None:
                continue
            if self.location.distance_to(entity.location) < distance:
                yield entity

    '''Entities within a certain distance squared.'''
    def entities_within_distance_squared(self, distance):
        #TODO actually implement this fully
        return self.entities_within_distance(distance**2)

class Location(tuple):
    '''An x,y location in the world.'''

    __slots__ = []

    def __new__(cls, x=None, y=None):
        if isinstance(x, int) and isinstance(y, int):
            return tuple.__new__(cls, (x, y))
        elif x is not None:
            # used by pickle
            return tuple.__new__(cls, x)
        else:
            raise Exception('invalid Location x,y: {},{}'.format(x,y))

    @property
    def x(self):
        return tuple.__getitem__(self, 0)

    @property
    def y(self):
        return tuple.__getitem__(self, 1)

    def __str__(self):
        return '<{},{}>'.format(self.x, self.y)

    def __repr__(self):
        return str(self)

    def __eq__(self, other):
        if type(other) is not Location:
            return False
        return self[0] == other[0] and self[1] == other[1]

    __hash__ = tuple.__hash__

    def distance_to_squared(self, location):
        return (location.x-self.x)**2+(location.y-self.y)**2

    def distance_to(self, location):
        return int(math.sqrt((location.x-self.x)**2+(location.y-self.y)**2))

    def direction_to(self, location):
        if __debug__:
            assert location != self, "Can not find direction to same location"
        
        dx = location.x - self.x
        dy = location.y - self.y

        return Direction.from_delta(dx, dy)
        
    def adjacent_location_in_direction(self, direction):
        return Location(self.x+direction.dx, self.y+direction.dy)

    def location_in_direction(self, direction, distance):
        if __debug__:
            assert (distance > 0), "Distance has to be greater than 0"

        dx = direction.dx*distance
        dy = direction.dy*distance
        return Location(self.x+dx, self.y+dy)

class Sector(object):
    def __init__(self, state, top_left):
        self._state = state
        self.top_left = top_left
        self.team = None

    def _update(self, data):
        if __debug__:
            assert self.top_left.x == data['topLeft']['x']
            assert self.top_left.y == data['topLeft']['y']

        self.team = self._state.teams[data['controllingTeamID']]
    
    def __eq__(self, other):
        if not isinstance(other, Sector):
            return False
        return self.top_left == other.top_left and self.team == other.team

    def __ne__(self, other):
        return not (self == other)

class Map(object):
    '''A game map.'''
    def __init__(self, state, height, width, tiles, sector_size):
        self._state = state
        self.height = height
        self.width = width
        self.tiles = tiles
        self.sector_size = sector_size
        self._sectors = {}
        self._occupied = {}
        for x in range(0, self.width, self.sector_size):
            for y in range(0, self.height, self.sector_size):
                top_left = Location(x, y)
                self._sectors[top_left] = Sector(self._state, top_left)

    def tile_at(self, location):
        '''Get the tile at a location.'''
        return self.tiles[location.y][location.x]

    def location_on_map(self, location):
        if __debug__:
            assert isinstance(location, Location), "Must pass a location"
        x = location.x
        y = location.y
        return ((y>0 and y < self.height) and (x>0 and x < self.width))

    def sector_at(self, location):
        if __debug__:
            assert self.location_on_map(location)
        loc = Location(
            location.x - location.x % self.sector_size,
            location.y - location.y % self.sector_size
        )
        return self._sectors[loc]

    def _update_sectors(self, data):
        for sector_data in data:
            top_left = Location(sector_data['topLeft']['x'], sector_data['topLeft']['y'])
            if __debug__:
                assert top_left.x % self.sector_size == 0
                assert top_left.y % self.sector_size == 0
            self._sectors[top_left]._update(sector_data)
    
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

class State(object):
    def __init__(self, game, teams, my_team_id, initialState):
        self._game = game

        self.map = Map(
            self,
            initialState['width'],
            initialState['height'],
            initialState['tiles'],
            initialState['sectorSize']
        )

        # initialize other state
        self.turn = 0
        self.entities = {}
        self.teams = teams
        self.my_team = teams[my_team_id]

        self.entities_by_location = {}

        self._action_queue = []

        for entity in self.entities.values():
            self.entities_by_location[entity.location] = entity

        self._update_entities(initialState['entities'])
        self.map._update_sectors(initialState['sectors'])

        self.speculate = True

    @property
    def get_turn(self):
        return self.turn

    @property
    def turn_next_spawn(self):
        return ((self.turn-1)//10+1)*10

    def entity_at_location(self, location):
        ''' Returns the entitiy at a given location'''
        return self.entities_by_location.get(location, None)

    def is_location_occupied(self, location):
        ''' Return true if there is an entity at given location'''
        return (self.entity_at_location(location)!=None)

    def _queue(self, action):
        self._game._queue(action)
    
    def _update_entities(self, data):
        for entity in data:
            id = entity['id']
            if id not in self.entities:
                self.entities[id] = Entity(self)
            self.entities[id]._update(entity)

    def _kill_entities(self, entities):
        for dead in entities:
            ent = self.entities[dead]
            del self.map._occupied[ent.location]
            del self.entities[dead]
    
    def _validate(self):
        for ent in self.entities.values():
            if not ent.is_held:
                assert self.map._occupied[ent.location] == ent.id
        for loc, id in self.map._occupied.items():
            assert self.entities[id].location == loc
    
    def _validate_keyframe(self, keyframe):
        altstate = State(self._game, self.teams, self.my_team.id, keyframe['state'])
        for id in self.entities:
            assert id in altstate.entities
            assert self.entities[id] == altstate.entities[id],\
                (self.entities[id], altstate.entities[id])
        for top_left in self.map._sectors:
            assert top_left in altstate.map._sectors
            assert self.map._sectors[top_left] == altstate.map._sectors[top_left],\
                (self.map._sectors[top_left] == altstate.map._sectors[top_left])

        self._validate()

if os.name == 'nt':
    DEFAULT_SERVER = ('localhost', 6147)
else:
    DEFAULT_SERVER = '/tmp/battlecode.sock'

class Game(object):
    '''A game that's currently running.'''

    def __init__(self, name, server=DEFAULT_SERVER):
        '''Connect to the server and wait for the first turn.
        name is the name this bot would like to be called; it will be ignored on the
        scrimmage server.
        Server is the address to connect to. Leave it as None to connect to a default local
        server; you shouldn't need to mess with it unless you're making custom matchmaking stuff.'''

        assert isinstance(name, str) \
               and len(name) > 5 and len(name) < 100, \
               'invalid team name: '+unicode(name)

        # setup connection
        if isinstance(server, str) and server.startswith('/') and os.name != 'nt':
            # unix domain socket
            conn = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM);
        else:
            # tcp socket
            conn = socket.socket()
        # connect to the server
        conn.connect(server)

        self._socket = conn.makefile('rwb', 2**16)

        # send login command
        self._send({
            'command': 'login',
            'name': name,
        })

        # handle login response
        resp = self._recv()
        assert resp['command'] == 'loginConfirm'

        self.my_team_id = resp['teamID']

        # wait for the start command
        start = self._recv()
        assert start['command'] == 'start'

        teams = {}
        for team in start['teams']:
            team = Team(team['teamID'], team['name'])
            teams[team.id] = team

        # initialize state info

        initialState = start['initialState']
        
        self.state = State(self, teams, self.my_team_id, initialState)

        self.winner = None

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

    def _finish(self, winner_id):
        self._socket.close()
        self._socket = None
        self.winner = self.state.teams[winner_id]

    def next_turn(self):
        '''Submit queued actions, and wait for our next turn.'''
        self._submit_turn()
        self._await_turn()

    def _await_turn(self):
        while True:
            turn = self._recv()

            if turn['command'] == 'keyframe':
                self.state._validate_keyframe(turn)
                continue

            assert turn['command'] == 'nextTurn'

            if 'winner' in turn:
                raise Exception('Game finished')

            self.state._kill_entities(turn['dead'])
            self.state._update_entities(turn['changed'])
            self.state.map._update_sectors(turn['changedSectors'])

            self.state.turn = turn['turn'] + 1

            if 'winnerID' in turn:
                self._finish(turn['winnerID'])
                return

            if __debug__:
                if turn['lastTeamID'] == self.state.my_team.id:
                    # handle what happened last turn
                    for action, reason in zip(turn['failed'], turn['reasons']):
                        print('{}failed: {}:{} reason: {}{}'.format(
                            _TERM_RED,
                            action['id'],
                            action['action'],
                            reason,
                            _TERM_END
                        ))

            if turn['nextTeamID'] == self.state.my_team.id:
                return

    def _submit_turn(self):
        self._send({
            'command': 'makeTurn',
            'turn': self.state.turn,
            'actions': self.state._action_queue
        })
        self.state._action_queue = []

    def _queue(self, action):
        self.state._action_queue.append(action)

    def turns(self, copy=True, speculate=True):
        if speculate:
            copy = True
        while True:
            self.next_turn()
            if self.winner:
                return
            else:
                self.state.speculate = speculate
                if copy:
                    self.state._game = None
                    speculative = _deepcopy(self.state)
                    speculative._game = self
                    self.state._game = self
                    yield speculative
                else:
                    yield self.state
            
class BattlecodeError(Exception):
    def __init__(self, *args, **kwargs):
        super(BattlecodeError, self).__init__(self, *args, **kwargs)

def _deepcopy(x):
    # significantly faster than copy.deepcopy
    return pickle.loads(pickle.dumps(x))