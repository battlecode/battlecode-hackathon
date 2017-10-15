#!/bin/sh

# run a process in the background and kill it when we exit
# if it exits, kill us
child() {
    echo $*
    # exec arguments
    $*&
    # get pid of child
    pid=$!
    # on our exit, kill child
    trap "kill $pid" EXIT HUP INT QUIT PIPE TERM
}

cd server
echo starting server
child npm start
sleep 2
cd ..

cd viewer
echo starting viewer
child npm start
sleep 10
cd ..

cd player-python
echo '\nstarting players\n'
child python3 testplayer.py
python3 testplayer.py
cd ..

echo done