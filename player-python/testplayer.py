import battlecode
import time
import random

game = battlecode.Game('testplayer')

rounds = 0

start = time.clock()

while True:
    game.next_turn()

    rounds += 1

    for entity in game.entities.values():
        if entity.team == game.team:
            entity.queue_move(battlecode.Location(
                entity.location.x + random.randint(-1,2),
                entity.location.y + random.randint(-1,2)
            ))
    if rounds > 10000:
        break

end = time.clock()
print('clock time: '+str(end - start))
print('per round: '+str((end - start) / 1000))