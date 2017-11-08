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

	outputs = ["",""]
	while all([sandbox.is_alive for sandbox in sandboxes]):
		lines = [sandbox.read_line() for sandbox in sandboxes]
		for i, line in enumerate(lines):
			if line:
				outputs[i] += line

	shutil.rmtree(workingPathA)
	shutil.rmtree(workingPathB)

try:
	connect_str = "dbname='battlecode' user='postgres' host='localhost' port='5433'"
	conn = psycopg2.connect(connect_str)
	c = conn.cursor()
except Exception as e:
    print("Uh oh, can't connect. Invalid dbname, user or password?")
    sys.exit()

BUCKET_NAME = 'battlecode-submissions-hackathon-2017-stage'
s3 = boto3.resource('s3')
MAX_MATCHES = 4

while True:
	# check if number of games running is less than N
	c.execute("SELECT id FROM scrimmage_matches WHERE status='running'")
	running = c.fetchall()

	if len(running) >= MAX_MATCHES:
		time.sleep(0.005)
		continue

	c.execute("SELECT m.id AS id, red_team, blue_team, s1.source_code AS red_source, s2.source_code as blue_source FROM scrimmage_matches m INNER JOIN scrimmage_submissions s1 on m.red_submission=s1.id INNER JOIN scrimmage_submissions s2 on m.blue_submission=s2.id WHERE status='queued' ORDER BY request_time DESC")
	matches = c.fetchall()

	if len(matches) < 1:
		time.sleep(0.005)
		continue

	match = matches[0]

	print(match)

	redKey, blueKey = random_key(20), random_key(20)
	c.execute("UPDATE scrimmage_matches SET red_secret_key=%s, blue_secret_key=%s, status='running' WHERE id=%s",(redKey,blueKey,match[0]))

	s3.Bucket(BUCKET_NAME).download_file(match[3], 'botA.zip')
	s3.Bucket(BUCKET_NAME).download_file(match[4], 'botB.zip')

	bots = [{"botID": match[1], "key":redKey, "path": "botA.zip"},{"botID": match[2], "key":blueKey, "path": "botB.zip"}]

	runGame(bots)

"""
os.system("sudo rm /run/network/ifstate.veth*")
os.system("docker stop $(docker ps -a -q)")
os.system("docker rm $(docker ps -a -q)")
"""