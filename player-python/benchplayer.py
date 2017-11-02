import battlecode
import time
import random

game = battlecode.Game('testplayer')

rounds = 0

start = time.clock()

for state in game.turns():
    for entity in state.entities.values():
        if entity.team != state.my_team or not entity.can_act:
            continue
        directions = list(battlecode.Direction.all())
        direction = directions[random.randrange(0, len(directions))]
        if random.random() < .1:
            if entity.can_build(direction):
                entity.queue_build(direction)
        else:
            if entity.can_move(direction):
                entity.queue_move(direction)
    
    print(state.turn, len(state.entities))
    
end = time.clock()
print('clock time: '+str(end - start))
print('per round: '+str((end - start) / 1000))