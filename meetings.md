# Meetings

## 26.05.2026
- Clarification of Service interaction
    - Simulation send bike data to MQTT message broker
    - NodeRED reads from MQTT and stores data in InfluxDB
    - NodeRED also detects errors and sends alerts to MQTT
    - Dashboard fetches data from InfluxDB to display bikes and rides
    - Dashboard fetches alerts from MQTT and displays them
- Clarification of data model
    - [Bike](./models/bike.ts)
    - [Alerts](./models/alerts.ts)
- Next steps and meeting
    - Friday 29.05.2026 online
    - What technology will be used for simulation?

## 25.05.2026
- Description of requirements for each service
    - where can bikes park?
        - At stations and outside, there are restrictions
    - no parking stations!
    - What happens in the processing step
- Data models
- Registration on Aualweb
    - title of project: Smarter Bicycle Mobility in Genoa
    - names of involved students: 
    - estimated submission date: 18.06.2026
    - Technologies that will be used:
        - NodeRED
        - Angular/React for Dashboard
        - wokwi (arduino)
        - InfluxDB
        - MQTT for notifications
- Next steps and meeting
    - 26.05.2026 at 3pm in Valetta Puggia in person
    - Finalize data models
    - Requirements processing and visualization

## 22.05.2026
- Introduction
- When do we want to finish?
    - as soon as possible, latest end of June
- Which project and what do we want to do concretely?
    - bike
- What are the work steps?
    - Data acquisition and simulation -> Henri
        - End devices (bikes, parking, phones?)
        - Existing data?
        - Simulation https://wokwi.com
    - Operation/Processing (booking, messages) -> Yonatan
        - NodeRED
    - Visualization -> Simon
        - Talk on bike sharing data https://www.youtube.com/watch?v=75GP4mRJP7A&pp=ygUPYmlrZXNoYXJpbmcgY2Nj
- How do we distribute the work?
- Next meeting Monday 3pm at Valetta Puggia
    - Functionality of each service
