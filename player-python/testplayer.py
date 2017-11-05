import battlecode
import time
import random

game = battlecode.Game('testplayer')

rounds = 0

start = time.clock()

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

        for direction in battlecode.Direction.all():
            if entity.can_throw(direction):
                entity.queue_throw(direction)
            break

        for direction in battlecode.Direction.all():
            if entity.can_move(direction):
                entity.queue_move(direction)




end = time.clock()
print('clock time: '+str(end - start))
print('per round: '+str((end - start) / 1000))
