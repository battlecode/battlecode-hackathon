'''Play battlecode hackathon games.'''
from enum import Enum
import socket
import ujson as json
import math
import io
import time
import copy

# pylint: disable = too-many-instance-attributes, invalid-name, W0622, W0212

THROWER = 'thrower'
HEDGE = 'hedge'
STATUE = 'statue'

GRASS = 'G'
DIRT = 'D'

def direction_rotate_degrees_clockwise(direction, degrees):
    if __debug__:
        assert (degrees %45 == 0), "Rotation must be a multiple of 45 degrees"

    return Direction((direction.value+degrees//45%8))

def direction_to_delta(direction):
    ''' Take a direction and return a delta x and delta y to go in that
    direction '''
    if direction == Direction.NORTH:
        delx = 0
        dely = 1
    elif direction == Direction.NORTH_EAST:
        delx = 1
        dely = 1
    elif direction == Direction.NORTH_WEST:
        delx = -1
        dely = 1
    elif direction == Direction.SOUTH:
        delx = 0
        dely = 1
    elif direction == Direction.SOUTH_EAST:
        delx = 1
        dely = -1
    elif direction == Direction.SOUTH_WEST:
        delx = -1
        dely = -1
    elif direction == Direction.EAST:
        delx = 1
        dely = 0
    elif direction == Direction.WEST:
        delx = -1
        dely = 0
    else:
        delx = 0
        dely = 0
        if __debug__:
            assert False, "Invalid Direction Given"
    return (delx, dely)

class Direction(Enum):
    ''' This is an enum for direction '''
    NORTH = 0
    NORTH_EAST = 1
    EAST = 2
    SOUTH_EAST = 3
    SOUTH = 4
    SOUTH_WEST = 5
    WEST = 6
    NORTH_WEST = 7

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
        return 'id:{},type:{},team:{},location:{}>'.format(self.id, self.type, self.team,
                self.location)

    def __repr__(self):
        return str(self)

    def _update(self, data):
        self.id = data['id']
        self.type = data['type']
        self.team = self._state._game.teams[data['teamID']]
        self.hp = data['hp']
        if 'location' in data:
            self.location = Location(data['location']['x'], data['location']['y'])
        else:
            self.location = None

        if 'cooldownEnd' in data:
            self.cooldown_end = data['cooldownEnd']
        else: 
            self.cooldown_end = self._state.turn

        if 'holdingEnd' in data:
            self.holding_end = data['holdingEnd']
        else:
            self.holding_end = 0

        if 'heldBy' in data:
            self.held_by = self._state.entities[data['heldBy']]
        else:
            self.held_by = None

        if 'holding' in data:
            self.holding = self._state.entities[data['holding']]
        else:
            self.holding = None

    @property
    def cooldown(self):
        '''The number of turns left in this entity's cooldown.'''
        if self.cooldown_end is None:
            return 0
        return max(self._state.turn - self.cooldown_end, 0)

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
    def can_act(self):
        ''' Returns true if this is a robot with no cooldown. If either is
        false then this entity cannot perform any actions this turn.'''
        return ((self.cooldown_end <= self._state.turn) and self.is_robot)

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
        entity = self._state.entity_at_location(location)
        on_map = self._state.map.location_on_map(location)

        if ((not on_map) or not (entity == None)):
            return False
        return True


    def can_pickup(self, entity):
        ''' Rreturns true if entity can pickup another entitiy in given
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
        location = self.location.adjacent_location_in_direction(direction)

        if __debug__:
            assert isinstance(location, Location), "Can't move to a non-location!"
            assert self.can_move(direction), "Invalid move cannot move in given direction"

        self._state._queue({
            'action': 'move',
            'id': self.id,
            'loc': {
                'x': location.x,
                'y': location.y
            }
        })

    def queue_move_location(self, location):
        '''Queues a move, so that this object will move in the next turn.'''
        if __debug__:
            assert isinstance(location, Location), "Can't move to a non-location!"

        self._state._queue({
            'action': 'move',
            'id': self.id,
            'loc': {
                'x': location.x,
                'y': location.y
            }
        })

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

        location = self.location.adjacent_location_in_direction(direction)
        self._state._queue({
            'action': 'throw',
            'id': self.id ,
            'loc': {
                'x': location.x,
                'y': location.y
            }
        })

    def queue_pickup(self, entity):
        if __debug__:
            assert self.can_pickup(entity), "Invalid Pickup Command"

        self._state._queue({
            'action': 'pickup',
            'id': self.id ,
            'pickupid': entity.id
        })

    def entities_within_distance(self, distance):
        '''entities within a certain distance'''
        near_entities = []
        for entity in self._state.entities.values():
            if self.location.distance_to(entity.location) < distance:
                near_entities.append(entity)

        near_entities.remove(self)
        return near_entities

    '''Entities within a certain distance squared.'''
    def entities_within_distance_squared(self, distance):
        #TODO actually implement this fully
        return self.entities_within_distance(distance**2)

class Location(object):
    '''An x,y location in the world.'''

    def __init__(self, x, y):
        if __debug__:
            assert isinstance(x, int) or math.floor(x) == x, 'non-integer location: '+str(x)
            assert isinstance(y, int) or math.floor(y) == y, 'non-integer location: '+str(y)

        self.x = int(x)
        self.y = int(y)

    def __str__(self):
        return '<{},{}>'.format(self.x, self.y)

    def __repr__(self):
        return str(self)

    def __eq__(self, other):
        return isinstance(other, Location) and other.x == self.x and other.y == self.y

    def __hash__(self):
        return self.x << 16 | self.y

    def distance_to_squared(self, location):
        return (location.x-self.x)**2+(location.y-self.y)**2

    def distance_to(self, location):
        return int(math.sqrt((location.x-self.x)**2+(location.y-self.y)**2))

    def direction_to(self, location):
        if __debug__:
            assert location != self, "Can not find direction to same location"

        delx = location.x - self.x
        dely = location.y - self.y
        if dely > 0 and delx > 0:
            return Direction.NORTH_EAST
        elif dely > 0 and delx < 0:
            return Direction.NORTH_WEST
        elif dely > 0 and delx == 0:
            return Direction.NORTH
        elif delx > 0:
            return Direction.SOUTH_EAST
        elif delx < 0:
            return Direction.SOUTH_WEST
        else:
            return Direction.SOUTH

    def adjacent_location_in_direction(self, direction):
        (delx, dely) = direction_to_delta(direction)
        return Location(self.x+delx, self.y+dely)

    def location_in_direction(self, direction, distance):
        if __debug__:
            assert (distance > 0), "Distance has to be greater than 0"

        (delx, dely) = direction_to_delta(direction)
        delx = delx*distance
        dely = dely*distance
        return Location(self.x+delx, self.y+dely)

class Sector(object):
    def __init__(self, game, top_left):
        self._game = game
        self.top_left = top_left
        self.team = None
    
    def _update(self, data):
        if __debug__:
            assert self.top_left.x == data['topLeft']['x']
            assert self.top_left.y == data['topLeft']['y']

        self.team = self._game.teams[data['controllingTeamID']]

class Map(object):
    '''A game map.'''
    def __init__(self, game, height, width, tiles, sector_size):
        self._game = game
        self.height = height
        self.width = width
        self.tiles = tiles
        self.sector_size = sector_size
        self._sectors = {}
        for x in range(0, self.width, self.sector_size):
            for y in range(0, self.height, self.sector_size):
                top_left = Location(x, y)
                self._sectors[top_left] = Sector(self._game, top_left)

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
    def __init__(self, game, turn, map):
        self._game = game
        # initialize other state
        self.turn = turn
        self.entities = {}
        self.map = map

        self.entities_by_location = {}

        self._action_queue = []

        for entity in self.entities.values():
            self.entities_by_location[entity.location] = entity

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
        if __debug__:
            assert self._game.state == self, 'queueing from stale state!'
        self._game._queue(action)
    
    def _update_entities(self, data):
        for entity in data:
            id = entity['id']
            if id not in self.entities:
                self.entities[id] = Entity(self)
            self.entities[id]._update(entity)

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

        self.team_id = resp['teamID']

        # wait for the start command
        start = self._recv()
        assert start['command'] == 'start'

        team_id = resp['teamID']
        self.teams = {}
        for team in start['teams']:
            team = Team(team['teamID'], team['name'])
            self.teams[team.id] = team

        self.myteam = self.teams[self.team_id]

        # initialize state info

        initialState = start['initialState']
        map = Map(
            self,
            initialState['width'],
            initialState['height'],
            initialState['tiles'],
            initialState['sectorSize']
        )

        self.state = State(self, 0, map) 
        self.state._update_entities(initialState['entities'])
        self.state.map._update_sectors(initialState['sectors'])

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
        self.winner = self.teams[winner_id]

    def next_turn(self):
        '''Submit queued actions, and wait for our next turn.'''
        self._submit_turn()
        self._await_turn()

    def _await_turn(self):
        while True:
            turn = self._recv()

            assert turn['command'] == 'nextTurn'

            if 'winner' in turn:
                raise Exception('Game finished')

            for dead in turn['dead']:
                del self.state.entities[dead]

            self.state._update_entities(turn['changed'])
            self.state.map._update_sectors(turn['changedSectors'])

            self.state.turn = turn['turn']

            if 'winnerID' in turn:
                self._finish(turn['winnerID'])

            if turn['nextTeamID'] == self.myteam.id:
                return

    def _submit_turn(self):
        self._send({
            'command': 'makeTurn',
            'previousTurn': self.state.turn,
            'actions': self.state._action_queue
        })

    def _queue(self, action):
        self.state._action_queue.append(action)

    def turns(self):
        while True:
            self.next_turn()
            if self.winner:
                return
            else:
                yield self.state
            
class BattlecodeError(Exception):
    def __init__(self, *args, **kwargs):
        super(BattlecodeError, self).__init__(self, *args, **kwargs)
