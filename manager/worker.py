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
		runGameShellCommand = os.path.join(os.path.abspath(botPath), "run.sh")

		print(runGameShellCommand)

		sandboxes[index].start(runGameShellCommand)

	outputs = ["",""]
	while all([sandbox.is_alive for sandbox in sandboxes]):
		lines = [sandbox.read_line() for sandbox in sandboxes]
		for i, line in enumerate(lines):
			if line:
				outputs[i] += line

	shutil.rmtree(workingPathA)
	shutil.rmtree(workingPathB)

#pull from queue

bots = [{"userID": "userAID", "botID": "botAID", "path": "botA.zip"},{"userID": "userBID", "botID": "botBID", "path": "botB.zip"}]

commandLineOutputs = runGame(bots)

for ouput in commandLineOutputs:
	print(output)

# Keep docker from crashing the system
"""
os.system("sudo rm /run/network/ifstate.veth*")
os.system("docker stop $(docker ps -a -q)")
os.system("docker rm $(docker ps -a -q)")
"""
