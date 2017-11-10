echo 1 > /proc/sys/net/ipv4/ip_forward
echo "Creating Docker Image"
docker build -t 'virtual_machine' - < Dockerfile
echo "Retrieving Installed Docker Images"
docker images
echo 0 > /proc/sys/net/ipv4/ip_forward
