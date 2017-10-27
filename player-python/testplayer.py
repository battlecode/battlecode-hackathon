import battlecode
import time
import random

game = battlecode.Game('testplayer')


rounds = 0

start = time.clock()

while True:
    game.next_turn()
    state = game.get_current_state()


    for entity in state.entities.values():
        if entity.team == game.myteam or not entity.can_act:
            continue
        my_location = entity.location
        near_entites = entity.entities_within_distance_squared(2)
        near_entites = list(filter(lambda x: x.can_be_picked, near_entites))
        if len(near_entites)>0:
            index = random.randrange(0, len(near_entites))
            other_entity = near_entites[index]

            if(entity.can_pickup(other_entity)):
                entity.queue_pickup(other_entity)



        near_entites = entity.entities_within_distance(30)
        if len(near_entites)>2:
            index = random.randrange(0, len(near_entites))
            direction_to = entity.location.direction_to(near_entites[index].location)
            print(entity.can_move(direction_to))
            if entity.can_move(direction_to):
                entity.queue_move(direction_to)
        else:
            direction_to = \
                entity.location.direction_to(battlecode.Location(0,0))
            if entity.can_move(direction_to):
                entity.queue_move(direction_to)

    print(state.turn)
    if(state.turn > 1000):
        break

end = time.clock()
print('clock time: '+str(end - start))
print('per round: '+str((end - start) / 1000))
