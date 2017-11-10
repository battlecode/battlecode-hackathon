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

running_games = []
s3 = boto3.resource('s3')
bucket = s3.Bucket(config.BUCKET_NAME)

MAX_GAMES = 4
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
	tempPath = os.path.join(destinationFilePath, "bot")
	os.mkdir(tempPath)

	# Extract the archive into a folder call 'bot'
	if platform.system() == 'Windows':
		os.system("7z x -o"+tempPath+" -y "+filePath+". > NUL")
	else:
		os.system("unzip -u -d"+tempPath+" "+filePath+" > /dev/null 2> /dev/null")

	# Remove __MACOSX folder if present
	macFolderPath = os.path.join(tempPath, "__MACOSX")
	if os.path.exists(macFolderPath) and os.path.isdir(macFolderPath):
		shutil.rmtree(macFolderPath)

	# Copy contents of bot folder to destinationFilePath remove bot folder
	for filename in os.listdir(tempPath):
		shutil.move(os.path.join(tempPath, filename), os.path.join(destinationFilePath, filename))

	shutil.rmtree(tempPath)
	#os.remove(filePath)

def runGame(bots):
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
	botPaths = [os.path.join(workingPathA, str(bots[0]['botID'])), os.path.join(workingPathB, str(bots[1]['botID']))]

	for botPath in botPaths: os.mkdir(botPath)
	for a in range(len(bots)): unpack(bots[a]['path'], botPaths[a])
	for index, botPath in enumerate(botPaths):
		if os.path.isfile(os.path.join(botPath, "run.sh")) == False:
			return
		os.chmod(botPath, 0o777)
		os.chmod(os.path.join(botPath, "run.sh"), 0o777)
		runGameShellCommand = os.path.join(os.path.abspath(botPath), "run.sh") + " " + bots[index]['key']

		sandboxes[index].start(runGameShellCommand)

	return sandboxes

def endGame(game):
	winners = []
	replays = []
	for match in game.matches:
		if match.winner is not None:
			if match.sandboxes is not None:
				for sandbox in match.sandboxes:
					sandbox.kill()
				match.sandboxes = None
			winners.append(match.winner)
			replays.append(match.replay_data)
	if len(winners) < len(game.matches):
		return

	keys = []
	for replay in replays:
		if replay is None:
			keys.append("none")
			continue
		keys.append("replays/" + random_key(20) + ".bch17")
		bucket.put_object(Key=keys[-1], Body=replay)

	teamA = 0
	teamB = 0
	for i, winner in enumerate(winners):
		if winner==1:
			teamA += 1
		if winner==2:
			teamB += 1
		winners[i] = game.teams[i].db_id

	winner = 0 if teamA==teamB else 1 if teamA>teamB else 2
	if winner == 0:
		print(prefix+"Game between " + game.teams[0].name + " and " + game.teams[1].name + " failed, nobody connected to the engine.")
		c.execute("UPDATE scrimmage_matches SET status='failed' WHERE id=%s", (game.db_id))
		return

	redElo = getTeamRating(game['teams'][0]['botID'])
	blueElo = getTeamRating(game['teams'][1]['botID'])

	r_1 = 10**(redElo/400)
	r_2 = 10**(blueElo/400)

	e_1 = r_1/(r_1+r_2)
	e_2 = r_2/(r_1+r_2)

	red_elo = int(round(r_1 + ELO_K*(2-winner-e_1)))
	blue_elo = int(round(r_2 + ELO_K*(winner-1-e_2)))

	print(prefix+"Game between " + game.teams[0].name + " and " + game.teams[1].name + "completed (" + ("red" if winner==1 else "blue") + " won), new elos: " + str(red_elo) + " and " +str(blue_elo) + ".")

	c.execute("UPDATE scrimmage_matches SET status='completed', match_files=%s, match_winners=%s, red_rating_after=%s, blue_rating_after=%s WHERE id=%s", (keys,winners,game.db_id, red_elo,blue_elo))

def listen(games, socket):
	while True:
		message = json.loads(next(socket))
		if message['command'] == 'createGameIDConfirm':
			games[-1]['ng_id'] = message['gameID']
		else:
			for game in games:
				for match in game.matches:
					if match['ng_id'] == message['id']:
						if message['command'] == 'playerConnected':
							match['connected'][int(message['team'])-1] = True
							print(prefix+game.teams[int(message['team'])-1].name + " connected in match against " + game.teams[int(not bool(int(message['team'])))-1].name + ".")
						if message['command'] == 'gameReplay':
							match.replay_data = message['matchData']
							match.winner = int(message['winner'])
							print(prefix+"Match between " + game.teams[0].name + " and " + game.teams[1].name + "ended (" + ("red" if match.winner==1 else "blue" if match.winner==2 else "nobody") + " won).")

							endGame(game)
		time.sleep(0.005)


def startGame(teams, map):
	command = {"command":"createGame","serverKey":config.SERVER_KEY,"teams":teams,"map":map,"sendReplay":True}
	s.send(json.dumps(command))
	received = json.loads(s.recv(BUFFER_SIZE))
	return received['gameID']

def getTeamRating(id):
	c.execute("SELECT red_rating_after, finish_time FROM scrimmage_matches WHERE ranked = TRUE and scrimmage_status = 'completed' and red_team = %s ORDER BY finish_time DESC",(id))
	redElos = c.fetchone()
	c.execute("SELECT blue_rating_after, finish_time FROM scrimmage_matches WHERE ranked = TRUE and scrimmage_status = 'completed' and red_team = %s ORDER BY finish_time DESC",(id))
	blueElos = c.fetchone()

	elos = sorted([redElos+blueElos],key=lambda x: x[1],reverse=True)

	elo = ELO_START
	if len(elos) > 0:
		elo = elos[0][0]

	return elo


s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
	s.connect(('127.0.0.1', 6147))
	_thread.start_new_thread(listen,(running_games, s))
except Exception as e:
	print(prefix + "Failed to connect to engine. Exiting.")
	sys.exit()

print(prefix + "Connected to engine.  Queueing games now.")

while True:
	c.execute("SELECT m.id AS id, red_team, blue_team, s1.source_code AS red_source, s2.source_code as blue_source, t1.id as red_name, t2.id as blue_name, maps FROM scrimmage_matches m INNER JOIN scrimmage_submissions s1 on m.red_submission=s1.id INNER JOIN scrimmage_submissions s2 on m.blue_submission=s2.id INNER JOIN battlecode_teams t1 on m.red_team=t1.id INNER JOIN battlecode_teams t2 on m.blue_team=t2.id WHERE status='queued' ORDER BY request_time")
	queuedGames = c.fetchall()

	if len(running_games) >= MAX_GAMES or len(matches) < 1:
		time.sleep(0.005)

		for game in running_games:
			for match in game.matches:
				if not all(match['connected']) and (datetime.datetime.now() - game['start']).total_seconds() > 60:
					winners = []
					for i in range(2):
						if match['connected'][i]:
							winners.append(i+1)
					match.winner = 0 if len(winners)==0 else 1 if winners[0]==0 else 2
					endGame(game)
					print(prefix+"Match between " + game.teams[0].name + " and " + game.teams[1].name + "timed out (" + ("red" if match.winner==1 else "blue" if match.winner==2 else "nobody") + " won).")
		continue

	queuedGame = queuedGames[0]

	print(prefix+"Queuing game between " + game.teams[0].name + " and " + game.teams[1].name + ".")

	c.execute("UPDATE scrimmage_matches SET status='running' WHERE id=%s",(queuedGame[0]))

	bucket.download_file(queuedGame[3], 'botA.zip')
	bucket.download_file(queuedGame[4], 'botB.zip')

    maps = []
    for mapID in queuedGame[7]:
        c.execute("SELECT name from scrimmage_maps WHERE id=%s",(mapID))
        maps.append(c.fetchone)

	matches = []
	teams = [{"name":queuedGame[5],"key":None,"db_id":queuedGame[1]},{"name":queuedGame[6],"key":None,"db_id":queuedGame[2]}]
	for index, map in enumerate(maps):
		redKey, blueKey = random_key(20), random_key(20)
		bots = [{"botID": queuedGame[1], "key":redKey, "path": "botA.zip"},{"botID": queuedGame[2], "key":blueKey, "path": "botB.zip"}]

		teams[0].key = redKey
		teams[1].key = blueKey

		ng_id = startGame(teams,map)
		print(prefix + " --> Starting match " + str(index) + " of " + str(len(queuedGame[7])) + " on " + map + ".")
		matches.append({"ng_id":ng_id,"sandboxes":runGame(bots),"connected":[False,False],"replay_data":None,"winner":None})

	running_games.append({'db_id':queuedGame[0],'start':datetime.datetime.now(),'teams':teams,'matches':matches})

"""
os.system("sudo rm /run/network/ifstate.veth*")
os.system("docker stop $(docker ps -a -q)")
os.system("docker rm $(docker ps -a -q)")
"""
