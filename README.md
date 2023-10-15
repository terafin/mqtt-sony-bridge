# mqtt-denon-bridge

This is a simple docker container that I use to bridge to/from my MQTT bridge.

I have a collection of bridges, and the general format of these begins with these environment variables:

```
      TOPIC_PREFIX: /your_topic_prefix  (eg: /some_topic_prefix/somthing)
      MQTT_HOST: YOUR_MQTT_URL (eg: mqtt://mqtt.yourdomain.net)
      (OPTIONAL) MQTT_USER: YOUR_MQTT_USERNAME
      (OPTIONAL) MQTT_PASS: YOUR_MQTT_PASSWORD
```

This will publish and (optionally) subscribe to events for this bridge with the TOPIC_PREFIX of you choosing.

Generally I use 0 as 'off', and 1 as 'on' for these.

For changing states '/set' commands also work, eg:

publish this to turn on the receiver

```
   topic: /living_room/denon/set/power
   value: 1
```

publish this to change the input to "Game"

```
   topic: /living_room/denon/set/input
   value: game
```

Here's an example docker compose:

```
version: '3.3'
services:
  mqtt-cyberpower-bridge:
    image: ghcr.io/terafin/mqtt-denon-bridge:latest
    environment:
      LOGGING_NAME: mqtt-denon-bridge
      TZ: America/Los_Angeles
      TOPIC_PREFIX: /your_topic_prefix  (eg: /living_room/cabinet/sonos)
      AVR_IP: YOUR_DENON_IP
      AVR_PORT: "23"
      MQTT_HOST: YOUR_MQTT_URL (eg: mqtt://mqtt.yourdomain.net)
      (OPTIONAL) MQTT_USER: YOUR_MQTT_USERNAME
      (OPTIONAL) MQTT_PASS: YOUR_MQTT_PASSWORD
```

Here's an example publish for my setup:

```
/living_room/denon/power 1
/living_room/denon/input mplay
/living_room/denon/volume 50.5
/living_room/denon/mute 0
```
