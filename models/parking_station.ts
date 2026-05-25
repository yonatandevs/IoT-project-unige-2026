export interface ParkingStation {
    id: string
    position: { lng: number, lat: number }
    total_spots: number
    parked_bikes: string[]
}