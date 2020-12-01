# PCF Bing Maps Component

Use latitude and longitude values from records to show them on a map, and mark a location as expired if the lat/long values were last set outside of a configurable time period. This could be used for live tracking of engineers.

Managed and unmanaged solutions can be found in `BingMapsComponent\Solutions\BingMapsGrid\bin`

## Demo

![demo](/img/demo.gif)

## Configuration

Create a view that has the latitude and longitude columns and optionally a datetime column that will show when the lat/long was last updated/

![addtoview](/img/attachtoview.png)

Configure the field names that will be read to retrieve latitude, longitude, and name for the map pushpin. If the location timestamp value is left blank then records will not be marked as expired. Use this when displaying static locations on a map (e.g. Accounts rather than Field Service Engineers)

You will need to provide your own Bing Maps API key.



![addtoview](/img/configure.png)