/// <reference path="../node_modules/bingmaps/types/MicrosoftMaps/Microsoft.Maps.d.ts" />

import {IInputs, IOutputs} from "./generated/ManifestTypes";
import DataSetInterfaces = ComponentFramework.PropertyHelper.DataSetApi;
type DataSet = ComponentFramework.PropertyTypes.DataSet;

export class BingMapsComponent implements ComponentFramework.StandardControl<IInputs, IOutputs> {

//contains all the elements for the control
private _container: HTMLDivElement;
private _mapDiv: HTMLDivElement;
private _mapInfoDiv: HTMLDivElement;

private _bMapScriptIsLoaded: boolean;
private _bMapIsLoaded: boolean;

//map parameters
private _bMap: Microsoft.Maps.Map;
private _bMapOptions: Microsoft.Maps.IViewOptions;
private _bMapInfoBox: Microsoft.Maps.Infobox;
private _bMapLoadingBox: Microsoft.Maps.Infobox;

// PCF framework delegate which will be assigned to this object which would be called whenever any update happens. 
private _notifyOutputChanged: () => void;
// Event Handler 'refreshData' reference
private _refreshData: EventListenerOrEventListenerObject;
// Reference to ComponentFramework Context object
private _context: ComponentFramework.Context<IInputs>;

/**
 * Empty constructor.
 */
constructor()
{

}

/**
 * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
 * Data-set values are not initialized here, use updateView.
 * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
 * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
 * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
 * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
 */
public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, state: ComponentFramework.Dictionary, container:HTMLDivElement)
{
	//this will ensure that if the container size changes the updateView function will be called.
	context.mode.trackContainerResize(true);

	// Add control initialization code
	this._notifyOutputChanged = notifyOutputChanged;
	this._context = context;
	this._container = container;
	this._bMapIsLoaded = false;

	this.addBingMapsScriptToHeader(this._context);

	let mainDiv = document.createElement("div");
	mainDiv.setAttribute("id", "mainDiv");

	this._mapDiv = document.createElement("div");
	this._mapDiv.setAttribute("id", "mapDiv");

	this._mapDiv.style.height = this._context.mode.allocatedHeight !== -1 ? `${(this._context.mode.allocatedHeight - 25).toString()}px` : "calc(100% - 25px)";

	this._mapInfoDiv = document.createElement("div");
	this._mapInfoDiv.setAttribute("id", "mapInfoDiv");

	mainDiv.appendChild(this._mapDiv);
	mainDiv.appendChild(this._mapInfoDiv);

	this._container.appendChild(mainDiv);

	// Set a paging size
	context.parameters.ViewDataSet.paging.setPageSize(1000);

	this.initMap();
}

public initMap(){

	var self = this;
	if (!this._bMapScriptIsLoaded) {			
		setTimeout(() => {self.initMap()}, 1000);
		return;
	}	

	this._bMapOptions = {			
		zoom: 0,			
		center: new Microsoft.Maps.Location(0,0),
		mapTypeId: Microsoft.Maps.MapTypeId.road
	};

	this._bMap = new Microsoft.Maps.Map(this._mapDiv, this._bMapOptions);
	this._bMapInfoBox = new Microsoft.Maps.Infobox(this._bMap.getCenter(), {visible: false});
	this._bMapInfoBox.setMap(this._bMap);

	this._bMapLoadingBox = new Microsoft.Maps.Infobox(this._bMap.getCenter(), {
		htmlContent: '<div class="loadingInfoBox"><div class="loadingText">Loading</div>',
		visible: true
	});

	this._bMapLoadingBox.setMap(this._bMap);

	// Close the info box when clicking anywhere on the map
	Microsoft.Maps.Events.addHandler(this._bMap, 'click', () => {this._bMapInfoBox.setOptions({visible: false});});
	
	this._bMapIsLoaded = true;
}

public addBingMapsScriptToHeader(context: any): void {
	var apiKey = context.parameters.bingMapsAPIKey.raw || "";
	
	let headerScript: HTMLScriptElement = document.createElement("script");
	headerScript.type = 'text/javascript';
	headerScript.id = "BingMapsHeaderScript";
	headerScript.async = true;
	headerScript.defer = true;
	headerScript.src = `https://www.bing.com/api/maps/mapcontrol?key=${apiKey}`;
	headerScript.onload = () => {
		this._bMapScriptIsLoaded = true;
	}
	
	this._container.appendChild(headerScript);
}	


/**
 * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
 * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
 */
public updateView(context: ComponentFramework.Context<IInputs>): void
{
	// Add code to update control view
	var self = this;
	var dataSet = context.parameters.ViewDataSet;

	//if we are in a canvas app we need to resize the map to make sure it fits inside the allocatedHeight
	if (this._context.mode.allocatedHeight !== -1) {
		this._mapDiv.style.height = `${(this._context.mode.allocatedHeight - 25).toString()}px`;
	}

	//if data set has additional pages retrieve them before running anything else
	if (dataSet.paging.hasNextPage) {
		dataSet.paging.loadNextPage();
		return;
	}	

	this.populateMap();

}

private populateMap() {
	var self = this;
	if (!this._bMapIsLoaded){			
		setTimeout(() => {self.populateMap()}, 1000);
		return;
	}

	this._bMapLoadingBox.setOptions({visible:false});

	let dataSet = this._context.parameters.ViewDataSet;
	let params = this._context.parameters;

	// Get the field names that hold the values we use
	var keys = { 
		lat: params.latFieldName.raw ? this.getFieldName(dataSet, params.latFieldName.raw) : "",
		long: params.longFieldName.raw ? this.getFieldName(dataSet, params.longFieldName.raw) : "",
		name: params.primaryFieldName.raw ? this.getFieldName(dataSet, params.primaryFieldName.raw) : "",
		description: params.descriptionFieldName.raw ? this.getFieldName(dataSet, params.descriptionFieldName.raw) : "",
		locationTime: params.locationTimestamp.raw ? this.getFieldName(dataSet, params.locationTimestamp.raw) : "",
	}

	//if dataset is empty or the lat/long fields are not defined then end
	if (!dataSet || !keys.lat || !keys.long) {
		return;
	}

	this._bMap.entities.clear();

	let totalRecordCount = dataSet.sortedRecordIds.length;

	// locationResults is later used to generate the map bounding box 
	let locationResults : Microsoft.Maps.Location[] = [];

	// Limit the number of pins that will be shown
	let recordLimit = this._context.parameters.maxLocationsToShow.raw || 0;
	if (totalRecordCount > recordLimit) {
		totalRecordCount = recordLimit;
	}

	// Add each record to the map
	for (let i=0; i<totalRecordCount; i++) {
		var recordId = dataSet.sortedRecordIds[i];
		var record = dataSet.records[recordId] as DataSetInterfaces.EntityRecord;

		var lat = record.getValue(keys.lat);
		var long = record.getValue(keys.long);
		var name = record.getValue(keys.name);
		var description = record.getValue(keys.description);
		var hasExpired = false;
		var locationRecordedDateTime = "";
		
		// Determine if the time the location was recorded has now expired
		if (keys.locationTime != "" && (params.locationExpiryTime.raw) && (params.locationExpiryTime.raw > 0)) {
			let locationRecordedOn = new Date(<string>record.getValue(keys.locationTime)).getTime();

			let minutesExpiry = params.locationExpiryTime.raw ? params.locationExpiryTime.raw : 0;
			let dateTimeNow = new Date().getTime();
			let expiresOn = dateTimeNow - (minutesExpiry * 60000);
			if (locationRecordedOn < expiresOn) {
				hasExpired = true;
			}

			locationRecordedDateTime = record.getFormattedValue(keys.locationTime);
		}
		

		var pushpinLatLong = new Microsoft.Maps.Location(lat, long);
		locationResults.push(pushpinLatLong);

		var pushPin = new Microsoft.Maps.Pushpin(pushpinLatLong, {title: name.toString()});

		// Set metadata that is used for mouseover and click events
		pushPin.metadata = {
			title: name,
			description: keys.description && record.getValue(keys.description) ? record.getValue(keys.description) : "",
			entityId: recordId,
			entityName: dataSet.getTargetEntityType(),
			locationLoggedOn: locationRecordedDateTime,
			locationHasExpired: hasExpired === true ? "(Expired)" : ""
		};

		if (hasExpired === true) {
			pushPin.setOptions({color : "gray"});
		} else {
			pushPin.setOptions({color: "orange"});
		}

		Microsoft.Maps.Events.addHandler(pushPin, 'click', this.pushPinInfoBoxOpen.bind(this));

		this._bMap.entities.push(pushPin);
	}

	//generate the bounding box for the map to allow user to quickly see the area in which the pins are located.
	this.generateBoundingBox(locationResults);	
}

public pushPinInfoBoxOpen(e: any): void{

	if (this._bMapInfoBox.getVisible() === true) {
		this._bMapInfoBox.setOptions({visible: false});
		return;
	}


	if (e.target.metadata) {
		//Define an HTML template for a custom infobox.
		var infoboxTemplate = `<div class="customInfobox"><div class="title">${e.target.metadata.title}</div>${e.target.metadata.description} <br />Last Seen: ${e.target.metadata.locationLoggedOn} ${e.target.metadata.locationHasExpired}</div>`;
		this._bMapInfoBox.setLocation(e.target.getLocation());
		this._bMapInfoBox.setHtmlContent(infoboxTemplate);
		this._bMapInfoBox.setOptions({visible: true});
	}
}


private generateBoundingBox(locationResults: Microsoft.Maps.Location[]) {
	
	if (locationResults.length > 0) {
		locationResults.sort(this.compareLocationValues('latitude'));
		let minLat = locationResults[0].latitude;
		let maxLat = locationResults[locationResults.length - 1].latitude;
		locationResults.sort(this.compareLocationValues('longitude'));
		let minLong = locationResults[0].longitude;
		let maxLong = locationResults[locationResults.length - 1].longitude;
		let box = Microsoft.Maps.LocationRect.fromEdges(maxLat, minLong, minLat, maxLong);
		this._bMap.setView({ bounds: box });
	}
}

private compareLocationValues(key: 'latitude' | 'longitude', order = 'asc'): any {
	return function innerSort(a: Microsoft.Maps.Location, b:Microsoft.Maps.Location): number {
	  if (!a.hasOwnProperty(key) || !b.hasOwnProperty(key)) {			
		return 0;
	  }

	  const loc = key === 'latitude' ? {a: a.latitude, b: b.latitude} : {a: a.longitude, b: b.longitude};
   
	  let comparison = 0;
	  if (loc.a > loc.b) {
		comparison = 1;
	  } else if (loc.a < loc.b) {
		comparison = -1;
	  }
	  return (
		(order === 'desc') ? (comparison * -1) : comparison
	  );
	};
}

/**
 * If a related field is being utilized this will ensure that the correct alias is being used.
 * @param dataSet 
 * @param fieldName 
 */
private getFieldName(dataSet: ComponentFramework.PropertyTypes.DataSet ,fieldName: string): string {
	//if the field name does not contain a . then just return the field name
	if (fieldName.indexOf('.') == -1) return fieldName;

	//otherwise we need to determine the alias of the linked entity
	var linkedFieldParts = fieldName.split('.');
	linkedFieldParts[0] = dataSet.linking.getLinkedEntities().find(e => e.name === linkedFieldParts[0].toLowerCase())?.alias || "";
	return linkedFieldParts.join('.');
}

/** 
 * It is called by the framework prior to a control receiving new data. 
 * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as “bound” or “output”
 */
public getOutputs(): IOutputs
{
	return {};
}

/** 
 * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
 * i.e. cancelling any pending remote calls, removing listeners, etc.
 */
public destroy(): void
{
	// Add code to cleanup control if necessary
}

}