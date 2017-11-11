import os
import os.path
import stat
import platform
import random
import shutil
import urllib.request
import urllib.parse
from sandbox import *
import copy
import psycopg2
import sys
import random
import string
import boto3
import botocore
import time
import requests
import socket
import json
import datetime
import _thread
import config
import base64

running_games = []
sneak = {'ng_id':None,'DB_BEING_USED':False}

s3 = boto3.resource('s3')
bucket = s3.Bucket(config.BUCKET_NAME)

MAX_GAMES = 16
INIT_TIME = 60

ELO_K = 20
ELO_START = 1200

ascii_header = """
    __          __  __  __     __               __
   / /_  ____ _/ /_/ /_/ /__  / /_  ____ ______/ /__
  / __ \\/ __ \`/ __/ __/ / _ \\/ __ \\/ __ \`/ ___/ //_/
 / /_/ / /_/ / /_/ /_/ /  __/ / / / /_/ / /__/ ,<
/_.___/\\__,_/\\__/\\__/_/\\___/_/ /_/\\__,_/\\___/_/|_|"""
prefix = "\033[0;0m[\033[0;35mmanager\033[0;0m] "
sys.stdout.write("\033[0;35m")
print(ascii_header)
sys.stdout.write("\033[1;34m")
print("="*55)
sys.stdout.write("\033[0;0m")
print(prefix + "Starting manager...")
try:
    conn = psycopg2.connect(config.PG_CRED)
    c = conn.cursor()
except Exception as e:
    print(prefix + "Failed to connect to database. Exiting.")
    sys.exit()
print(prefix + "Connected to database. Initializing connection to engine...")

def random_key(length):
    key = ''
    for i in range(length):
        key += random.choice(string.ascii_letters + string.digits + string.digits)
    return key

def unpack(filePath, destinationFilePath):
    # Extract the archive into a folder call 'bot'
    command = "tar -xzf " + os.path.abspath(".") + "/" + filePath + " -C "+ os.path.abspath(".") + "/" + destinationFilePath
    os.system(command)

def runGame(bots):
    print('runGame', bots)
    # Setup working path
    workingPathA = "workingPath/" + random_key(20) + "/"
    if os.path.exists(workingPathA):
        shutil.rmtree(workingPathA)
    os.makedirs(workingPathA)
    os.chmod(workingPathA, 0o777)

    workingPathB = "workingPath/" + random_key(20) + "/"
    if os.path.exists(workingPathB):
        shutil.rmtree(workingPathB)
    os.makedirs(workingPathB)
    os.chmod(workingPathB, 0o777)

    sandboxes = [Sandbox(os.path.abspath(workingPathA)), Sandbox(os.path.abspath(workingPathB))]

    # Unpack and setup bot files
    botPaths = [workingPathA,workingPathB]

    for a in range(len(bots)): unpack(bots[a]['path'], botPaths[a])
    for index, botPath in enumerate(botPaths):
        if os.path.isfile(os.path.join(botPath, "run.sh")) == False:
            print('no run.sh for',bots[index])
            return
    
        os.chmod(botPath, 0o777)
        os.chmod(os.path.join(botPath, "run.sh"), 0o777)
        
        print('starting',bots[index])
        runGameShellCommand = "cd " + os.path.abspath(botPath) + " && chmod +x run.sh && ./run.sh" + " " + bots[index]['key']
        sandboxes[index].start(runGameShellCommand)

    return sandboxes

def endGame(game,sneak):
    winners = []
    replays = []
    for match in game['matches']:
        if match['winner'] is not None:
            if match['sandboxes'] is not None:
                for sandbox in match['sandboxes']:
                    sandbox.kill()
                match['sandboxes'] = None
            winners.append(match['winner'])
            replays.append(match['replay_data'])
    if len(winners) < len(game['matches']):
        return

    for running_game in running_games:
        if game['db_id'] == running_game['db_id']:
            running_games.remove(running_game)

    keys = []
    for replay in replays:
        if replay is None:
            keys.append("none")
            continue
        
        keys.append("replays/" + random_key(20) + ".bch18")

        bucket.put_object(Key=keys[-1], Body=base64.b64decode(replay), ACL='public-read')
 
        keys[-1] = "https://s3.amazonaws.com/battlehack-private-2018/" + keys[-1]

    teamA = 0
    teamB = 0
    for i, winner in enumerate(winners):
        if winner==1:
            teamA += 1
        if winner==2:
            teamB += 1
        winners[i] = game['teams'][winner-1]['db_id']

    winner = 0 if teamA==teamB else 1 if teamA>teamB else 2
    if winner == 0:
        print(prefix+"Game between " + game['teams'][0]['name'] + " and " + game['teams'][1]['name'] + " failed, nobody connected to the engine.")
        while sneak['DB_BEING_USED']:
            time.sleep(0.005)
        sneak['DB_BEING_USED'] = True
        c.execute("UPDATE scrimmage_matches SET status='failed', finish_time=CURRENT_TIMESTAMP WHERE id=%s", [game['db_id']])
        conn.commit()
        sneak['DB_BEING_USED'] = False
        return

    red_elo = getTeamRating(game['teams'][0]['db_id'],sneak)
    blue_elo = getTeamRating(game['teams'][1]['db_id'],sneak)

    red_elo += ELO_K * (2-winner - 1/(1+10**((blue_elo-red_elo)/400)))
    blue_elo += ELO_K * (winner-1 - 1/(1+10**((red_elo-blue_elo)/400)))     

    print(prefix+"Game between " + game['teams'][0]['name'] + " and " + game['teams'][1]['name'] + "completed (" + ("red" if winner==1 else "blue") + " won), new elos: " + str(red_elo) + " and " +str(blue_elo) + ".")

    while sneak['DB_BEING_USED']:
        time.sleep(0.005)
    sneak['DB_BEING_USED'] = True
    c.execute("UPDATE scrimmage_matches SET status='completed', match_files=%s, match_winners=%s, red_rating_after=%s, blue_rating_after=%s, finish_time=CURRENT_TIMESTAMP WHERE id=%s", [keys,winners,red_elo,blue_elo,game['db_id']])
    conn.commit()
    sneak['DB_BEING_USED'] = False

def listen(games, socket, sneak):
    socket = socket.makefile('rwb',2**16)
    while True:
        message = json.loads(next(socket).decode())
        print('message:',message['command'])
        if message['command'] == 'createGameConfirm':
            sneak['ng_id'] = message['gameID']
        else:
            for game in games:
                for match in game['matches']:
                    print("match_id: " +match['ng_id'])
                    if match['ng_id'] == message['id']:
                        if message['command'] == 'playerConnected':
                            match['connected'][int(message['team'])-1] = True
                            print(prefix+game['teams'][int(message['team'])-1]['name'] + " connected in match against " + game['teams'][int(not bool(int(message['team'])-1))]['name'] + ".")
                        if message['command'] == 'gameReplay':
                            match['replay_data'] = message['matchData']
                            match['winner'] = int(message['winner']['teamID'])
                            print(prefix+"Match between " + game['teams'][0]['name'] + " and " + game['teams'][1]['name'] + " ended (" + ("red" if match['winner']==1 else "blue" if match['winner']==2 else "nobody") + " won).")

                            endGame(game, sneak)
        time.sleep(0.005)


def startGame(teams, match_map):
    command = json.dumps({"command":"createGame","sendReplay":True,"serverKey":config.SERVER_KEY,"teams":teams,"map":match_map,"sendReplay":True,"timeoutMS":1000000})
    s.send(command.encode())
    s.send(b'\n')

def getTeamRating(id, sneak):
    while sneak['DB_BEING_USED']:
        time.sleep(0.005)
    sneak['DB_BEING_USED'] = True
    try:
        c.execute("SELECT red_rating_after, finish_time FROM scrimmage_matches WHERE ranked = TRUE and status = 'completed' and red_team=%s ORDER BY finish_time DESC",[id])
        redElos = c.fetchall()
    except Exception as e:
        redElos = []
    
    try:
        c.execute("SELECT blue_rating_after, finish_time FROM scrimmage_matches WHERE ranked = TRUE and status = 'completed' and blue_team=%s ORDER BY finish_time DESC",[id])
        blueElos = c.fetchall()
    except Exception as e:
        blueElos = []
    sneak['DB_BEING_USED'] = False
    if len(redElos+blueElos) == 0:
        return ELO_START

    elos = sorted(redElos+blueElos,key=lambda x: x[1],reverse=True)

    elo = ELO_START
    if len(elos) > 0:
        elo = elos[0][0]

    return elo


s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.connect(('127.0.0.1', 6147))
    _thread.start_new_thread(listen, (running_games, s, sneak))
except Exception as e:
    print(prefix + "Failed to connect to engine. Exiting.")
    sys.exit()

print(prefix + "Connected to engine.  Queueing games now.")

while True:
    try:
        while sneak['DB_BEING_USED']:
            sleep(0.005)
        sneak['DB_BEING_USED'] = True        
        c.execute("SELECT m.id AS id, red_team, blue_team, s1.source_code AS red_source, s2.source_code as blue_source, t1.name as red_name, t2.name as blue_name, maps FROM scrimmage_matches m INNER JOIN scrimmage_submissions s1 on m.red_submission=s1.id INNER JOIN scrimmage_submissions s2 on m.blue_submission=s2.id INNER JOIN battlecode_teams t1 on m.red_team=t1.id INNER JOIN battlecode_teams t2 on m.blue_team=t2.id WHERE status='queued' ORDER BY request_time ASC")
    
        queuedGames = c.fetchall()
        sneak['DB_BEING_USED'] = False
    except Exception as e:
        conn.rollback()
        time.sleep(0.005)
        continue
    
    if len(running_games) >= max(MAX_GAMES,1) or len(queuedGames) < 1:
        time.sleep(0.100)
        for game in running_games:
            for match in game['matches']:
                timePassed = (datetime.datetime.now() - game['start']).total_seconds()
                if not all(match['connected']) and match['winner'] is None and timePassed > INIT_TIME:
                    winners = []
                    for i in range(2):
                        if match['connected'][i]:
                            winners.append(i+1)
                    match['winner'] = 0 if len(winners)==0 else winners[0]
                    endGame(game,sneak)
                    print(prefix+"Match between " + game['teams'][0]['name'] + " and " + game['teams'][1]['name'] + " timed out (" + ("red" if match['winner']==1 else "blue" if match['winner']==2 else "nobody") + " won).")
        continue

    queuedGame = queuedGames[0]

    try:
        print(prefix+"Queuing game between " + queuedGame[5] + " and " + queuedGame[6] + ".")
    except Exception as e:
        print(queuedGame)
        time.sleep(0.005)
        continue

    while sneak['DB_BEING_USED']:
        time.sleep(0.005)
    sneak['DB_BEING_USED'] = True
    c.execute("UPDATE scrimmage_matches SET status='running' WHERE id=%s",[queuedGame[0]])
    conn.commit()
    sneak['DB_BEING_USED'] = False

    bucket.download_file(queuedGame[3][49:], 'botA.tar.gz')
    bucket.download_file(queuedGame[4][49:], 'botB.tar.gz')
    
    maps = []
    for mapID in queuedGame[7]:
        while sneak['DB_BEING_USED']:
            time.sleep(0.005)
        sneak['DB_BEING_USED'] = True
        c.execute("SELECT name from scrimmage_maps WHERE id=%s",[mapID])
        maps.append(c.fetchone()[0])
        sneak['DB_BEING_USED'] = False

    matches = []
    teams = [{"name":queuedGame[5],"key":None,"db_id":queuedGame[1]},{"name":queuedGame[6],"key":None,"db_id":queuedGame[2]}]
    running_games.append({'db_id':queuedGame[0],'start':datetime.datetime.now(),'teams':teams,'matches':matches})
    for index, cur_map in enumerate(maps):
        redKey, blueKey = random_key(20), random_key(20)
        bots = [{"botID": queuedGame[1], "key":redKey, "path": "botA.tar.gz"},{"botID": queuedGame[2], "key":blueKey, "path": "botB.tar.gz"}]

        teams[0]['key'] = redKey
        teams[1]['key'] = blueKey

        startGame(teams,cur_map)
        print(prefix + " --> Starting match " + str(index) + " of " + str(len(queuedGame[7])) + " on " + cur_map + ".")

        while sneak['ng_id'] is None:
            time.sleep(0.005)

        matches.append({"ng_id":sneak['ng_id'],"sandboxes":runGame(bots),"connected":[False,False],"replay_data":None,"winner":None})
        sneak['ng_id'] = None

        if MAX_GAMES == 0:
            while matches[-1]['winner'] is None:
                time.sleep(0.100)


"""
os.system("sudo rm /run/network/ifstate.veth*")
os.system("docker stop $(docker ps -a -q)")
os.system("docker rm $(docker ps -a -q)")
"""
