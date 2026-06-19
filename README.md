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

In the following sectinons, the components are described in more detail.

### Bike and Simulation

### Data Processing

### Data Visualization and Controls

![Dashboard](./images/dashboard.png)
![Heatmap](./images/heatmap.png)
The data is visualized in a dashboard in order for operators to quickly get an overview of the bike fleet.
It allows analysis on different levels:

- Map
  - Shows the location of all bikes
  - Show the route of a selected ride
  - Highlights bikes with unhandled alerts
- Bike list
  - Lists further information of all bikes in the fleet like rental status, battery charge and usage
- Bike details 
  - Further status information regarding a single bike including total traveled km
  - List of all bike rides
  - List of all errors of this bike
  - Chart showing battery charge over the last 24 hours
  - Chart showing bike speed over the last 24 hours
- Alerts
  - All unhandled alerts are shown to the user
  - Toasts notify user about new alerts in real time
  - Alerts can be acknowledged in bike details view
- Heatmap
  - Shows popular routes in the last 24 hours or all time
  - Shows popular parking locations in the last 24 hours or all time

As the data is stored in a raw format in the influxdb, further dashboards could be built using a tool like Grafana.
Further data could be added and visualized, including the quality of GNSS signal, sensor malfunctions, etc.
It should be carefully decided which data is relevant to see at the first glance and which data might only be necessary in specific circumstances to not overload the screen.

Additional to the data visualization, the dashboard could also become a control panel for operators.
This could include locking or unlocking a bike from the application, changing the restriced/allowed parking zones and automatically notifying an employee about necessary bike maintenance.
