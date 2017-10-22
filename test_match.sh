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
sleep 5
cd ..

echo '\nstarting players\n'
cd player-python
child python3 testplayer.py
python3 testplayer.py
cd ..

#cd player-rust
#cargo build --release --example rustplayer
#child target/release/examples/rustplayer
#target/release/examples/rustplayer
#cd ..
