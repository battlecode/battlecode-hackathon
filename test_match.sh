#!/bin/sh

trap 'kill $(jobs -p)' EXIT

cd server
echo starting server
npm start&
sleep 2
cd ..

cd player-python
echo '\nstarting players\n'
python3 testplayer.py&
python3 testplayer.py
cd ..
