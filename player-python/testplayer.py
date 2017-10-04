import battlecode
import time

game = battlecode.Game('testplayer')

rounds = 0

start = time.clock()

while rounds < 1000:
    game.next_turn()

    rounds += 1

    for entity in game.entities.values():
        if entity.team == game.team.id:
            x = entity.location.x + 1
            entity.queue_move(battlecode.Location(entity.location.x + 1, entity.location.y))

end = time.clock()
print('clock time: '+str(end - start))
print('per round: '+str((end - start) / 1000))