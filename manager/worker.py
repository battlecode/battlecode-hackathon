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
	print("Starting game")

	# Setup working path
	workingPathA = "workingPathA"
	if os.path.exists(workingPathA):
		shutil.rmtree(workingPathA)
	os.makedirs(workingPathA)
	os.chmod(workingPathA, 0o777)

	workingPathB = "workingPathB"
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

try:
	connect_str = "dbname='battlecode' user='postgres' host='localhost' port='5433'"
	conn = psycopg2.connect(connect_str)
	c = conn.cursor()
except Exception as e:
    print("Uh oh, can't connect. Invalid dbname, user or password?")
    sys.exit()

BUCKET_NAME = 'battlehack-testing-2018'
s3 = boto3.resource('s3')
bucket = s3.Bucket(BUCKET_NAME)

MAX_MATCHES = 4
INIT_TIME = 60
SERVER_KEY = "secretkey"

ELO_K = 20
ELO_START = 1200

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setblocking(0)
s.connect(('127.0.0.1', '6147'))

running_games = []

def endGame(game, winners, matchReplay=None):
	if matchReplay is not None:
		key = "replays/" + random_key(20) + ".bch17"
		bucket.put_object(Key=key, Body=matchReplay)
	
	redElo = getTeamRating(game['teams'][0]['botID'])
	blueElo = getTeamRating(game['teams'][1]['botID'])
	
	r_1 = 10**(redElo/400)
	r_2 = 10**(redElo/400)
	
	e_1 = r_1/(r_1+r_2)
	e_2 = r_2/(r_1+r_2)

	s_1 = 0.5 if not (0 in winners and 1 in winners) else 1 if (0 in winners) else 0
	s_2 = 0.5 if not (0 in winners and 1 in winners) else 0 if (0 in winners) else 1

	red_elo = r_1 + ELO_K*(s_1-e_1)
	blue_elo = r_2 + ELO_K*(s_2-e_2)

	c.execute("UPDATE scrimmage_matches SET status='completed', " + ("" if matchReplay is None else "match_files=%s, ") + "match_winners=%s, red_rating_after=%s, blue_rating_after=%s WHERE id=%s",(winners,game.db_id, red_elo,blue_elo) if matchReplay is none else (key,winners,game.db_id, red_elo,blue_elo))

	for sandbox in game.sandboxes:
		sandbox.kill()

def listen(games, socket):
	while True:
		message = json.loads(next(socket))
		if message['command'] == 'createGameIDConfirm':
			running_games[-1]['ng_id'] = message['gameID']
		else:
			for game in games:
				if game['ng_id'] == message['id']:
					if message['command'] == 'playerConnected':
						game['connected'][int(message['team'])-1] = True
					if message['command'] == 'gameReplay':
						endGame(game,[message['winner']],matchReplay=message['matchData'])
		time.sleep(0.005)

_thread.start_new_thread(listen,(running_games, s))

def startGame(id, teams, map):
	command = {"command":"createGame","serverKey":SERVER_KEY,"teams":teams,"map":map,"sendReplay":True}
	s.send(json.dumps(command))
	received = json.loads(s.recv(BUFFER_SIZE))
	running_games.append({'db_id':id,'start':datetime.datetime.now(),'teams':teams,'connected':[False,False]})
	return running_games[-1]

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

while True:
	c.execute("SELECT m.id AS id, red_team, blue_team, s1.source_code AS red_source, s2.source_code as blue_source, t1.id as red_name, t2.id as blue_name, maps FROM scrimmage_matches m INNER JOIN scrimmage_submissions s1 on m.red_submission=s1.id INNER JOIN scrimmage_submissions s2 on m.blue_submission=s2.id INNER JOIN battlecode_teams t1 on m.red_team=t1.id INNER JOIN battlecode_teams t2 on m.blue_team=t2.id WHERE status='queued' ORDER BY request_time")
	matches = c.fetchall()

	if len(running_games) >= MAX_MATCHES or len(matches) < 1:
		time.sleep(0.005)

		for game in running_games:
			if not all(game['connected']) and (datetime.datetime.now() - running_games[0]['start']).total_seconds() > 60:
				winners = []
				for i in range(2)
					if game['connected'][i]:
						winners.append(game.teams[i]['teamID'])
				endGame(game,winners)
				
		running_games[0]
		continue

	match = matches[0]

	print(match)

	redKey, blueKey = random_key(20), random_key(20)
	c.execute("UPDATE scrimmage_matches SET status='running' WHERE id=%s",(match[0]))

	bucket.download_file(match[3], 'botA.zip')
	bucket.download_file(match[4], 'botB.zip')

	bots = [{"botID": match[1], "key":redKey, "path": "botA.zip"},{"botID": match[2], "key":blueKey, "path": "botB.zip"}]

	teams = [{"teamID":1,"name":match[5],"key":redKey,"lastElo":redElo},{"teamID":2,"name":match[6],key=blueKey}]
	
	game = startGame(match[0],teams,match[7][0])
	game['sandboxes'] = runGame(bots)

"""
os.system("sudo rm /run/network/ifstate.veth*")
os.system("docker stop $(docker ps -a -q)")
os.system("docker rm $(docker ps -a -q)")
"""