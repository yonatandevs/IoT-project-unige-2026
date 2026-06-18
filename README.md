# IoT Project UNIGE 2026 – Smarter Bicycle Mobility in Genoa

This is a design for a bike sharing mobility platform for the municipality of Genoa.
The slideshow can be found [here](https://docs.google.com/presentation/d/12apYBCjeo8CgFIBna6Lill1BvOEHjzwkTz_h2BHt-9Q/edit?usp=sharing).

## Architecture

![Architecture](images/architecture.png)

The system consists of the following components

 - Bikes are equipped with sensors, including GPS, orientation, acceleration, the charging status of the battery as well as information about the bike itself e.g. if its locked or currently rented.
 - The bike sends this combined sensor data to the MQTT message broker [Mosquito](https://mosquitto.org).
 - Node-RED fetches the data from the MQTT broker and detects whether certain alerts should be triggered.
 - The alerts and the initial sensor data are then persisted in the time series database [influxdb](https://www.influxdata.com).
 - A dashboard fetches all data from the database to organize and visualize it.
 - Alerts can be acknowledged in the dashboard which will create a new record in the database.
