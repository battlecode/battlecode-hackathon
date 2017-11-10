#!/bin/sh

###########################
# Docker SETUP
###########################
apt-get update
sudo apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo apt-get install docker-ce

echo "Docker Setup complete"

###########################
# Start Docker
###########################
chmod 777 UpdateDocker.sh

service docker restart
./UpdateDocker.sh
echo 0 > /proc/sys/net/ipv4/ip_forward
