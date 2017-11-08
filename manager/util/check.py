import sys
import zipfile
from compiler import *
import json

def compile(zipFilename):
	# Setup working path
	workingPath = "workingPath"
	if os.path.exists(workingPath):
		shutil.rmtree(workingPath)
	os.makedirs(workingPath)
	os.chmod(workingPath, 0o777)
	unpack(zipFilename, workingPath)

	language, errors = compile_anything(workingPath)
	didCompile = True if errors == None else False
	if didCompile:
		zipFolder(workingPath, zipFilename)
	#shutil.rmtree(workingPath)
	print("ye2")
	if didCompile:
		print(json.dumps({"isError": False, "message": "Your bot compiled correctly!", "score": 0}))
	else:
		print(json.dumps({"isError": True, "message": "There was an error compiling your bot. Error message: \""+str(errors)+"\""}))
print(sys.argv[-1])
compile(sys.argv[-1])
