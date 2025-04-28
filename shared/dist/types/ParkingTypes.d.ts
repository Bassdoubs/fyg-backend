export interface Gate {
    terminal?: string;
    porte?: string;
}
export interface MapInfo {
    hasMap?: boolean;
    mapUrl?: string;
    source?: string;
}
export interface ParkingData {
    _id: string;
    airline: string;
    airport: string;
    gate?: Gate;
    mapInfo?: MapInfo;
    createdAt: string;
    updatedAt: string;
    __v?: number;
}
//# sourceMappingURL=ParkingTypes.d.ts.map