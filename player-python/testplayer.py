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
        if entity.team == game.myteam:
            entity.queue_move(battlecode.Location(
                entity.location.x + random.randint(-1,2),
                entity.location.y + random.randint(-1,2)
            ))

    print(state.turn)
    if(state.turn > 200):
        break

end = time.clock()
print('clock time: '+str(end - start))
print('per round: '+str((end - start) / 1000))
