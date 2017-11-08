import battlecode
import time
import random

game = battlecode.Game('testplayer')

rounds = 0

start = time.clock()

def nearest_glass_state(state, entity):
    nearest_statue = None
    nearest_dist = 10000
    for other_entity in state.get_entities(entity_type=battlecode.STATUE):
        dist = entity.location.distance_to(other_entity.location)
        if(dist< nearest_dist):
            dist = nearest_dist
            nearest_statue = other_entity

    return nearest_statue

for state in game.turns():
    for entity in state.get_entities(team=state.my_team):
        if entity.team != state.my_team or not entity.can_act:
            continue
        my_location = entity.location
        near_entites = entity.entities_within_distance_squared(2)
        near_entites = list(filter(lambda x: x.can_be_picked, near_entites))

        for pickup_entity in near_entites:
            if entity.can_pickup(pickup_entity):
                entity.queue_pickup(pickup_entity)

        statue = nearest_glass_state(state, entity)
        if(statue != None):
            direction = entity.location.direction_to(statue.location)
            if entity.can_throw(direction):
                entity.queue_throw(direction)

        for direction in battlecode.Direction.all():
            if entity.can_move(direction):
                entity.queue_move(direction)

end = time.clock()
print('clock time: '+str(end - start))
print('per round: '+str((end - start) / 1000))
