# Builder daemon

This simple program is used to build our Gatsby website.

## Install

1. Install node app.
   ```sh
   npm install -g oikeuttaelaimille/builder
   ```

2. Start app with systemd.
   ```sh
   cat > /etc/systemd/system/builder.service <<EOF
   [Unit]
   Description=Builder Service
   After=network.target
   [Service]
   Type=simple
   User=ubuntu
   Group=ubuntu
   WorkingDirectory=/tmp
   ExecStart=/usr/lib/node_modules/builder/index.js 9999
   Environment=COMMAND=/home/ubuntu/scripts/build.sh
   Environment=COMMAND_WORKING_DIRECTORY=/tmp
   [Install]
   WantedBy=default.target
   EOF

   systemctl start builder.service
   systemctl enable builder.service
   ```

3. Add build command
   ```sh
   cat > /home/ubuntu/scripts/build.sh <<EOF

   # Your build script here.
   npx gatsby build

   EOF
   ```
