#!/usr/bin/env bash

function finish {
  echo 'Build failed :('
  exit 1
}

# If a command fails, make the whole script exit.
set -eEuf -o pipefail
trap finish ERR

echo "starting build $@"

# cd ~/Private/oikeuttaelaimille/frontend
cd /var/www/oikeuttaelaimille/frontend

export GATSBY_DRUPAL_HOST='http://localhost:8888'
export DRUPAL_USERNAME='gatsby'
export DRUPAL_PASSWORD='test-api-key'

# Turn on better format for loggin on Gatsby commands:
export CI='true'

npx gatsby build

echo 'end'
