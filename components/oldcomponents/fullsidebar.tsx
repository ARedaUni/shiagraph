import { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, Edit, Filter } from "lucide-react"

const NodeDetailsSidebar = ({ node, neighbors, relationships, onClose }) => {
  const [activeFilter, setActiveFilter] = useState('all')

  const neighborTypes = neighbors?.reduce((acc, neighbor) => {
    neighbor.labels.forEach(label => {
      acc[label] = (acc[label] || 0) + 1
    })
    return acc
  }, {}) || {}

  const relationshipTypes = relationships?.reduce((acc, rel) => {
    acc[rel.type] = (acc[rel.type] || 0) + 1
    return acc
  }, {}) || {}

  // Function to render the relationship node badge
  const RelationshipNode = ({ label, name }) => (
    <div className="flex flex-col items-start gap-1 min-w-[120px] flex-none">
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
        {label}
      </Badge>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {name}
      </span>
    </div>
  )

  // New component for the relationship arrow
  const RelationshipArrow = ({ type }) => (
    <div className="flex flex-col items-center flex-grow">
      <span className="text-xs text-gray-500 mb-1">{type}</span>
      <div className="relative w-full h-[1px] bg-gray-300">
        <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-gray-300"></div>
      </div>
    </div>
  )

  return (
    <Card className="w-[400px] absolute top-4 left-4 bg-white dark:bg-gray-900 shadow-lg rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          {node.labels.map(label => (
            <Badge 
              key={label} 
              className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100 rounded-full px-3"
            >
              {label}
            </Badge>
          ))}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {node.properties.name || node.id}
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="properties" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-gray-50 dark:bg-gray-900 p-0 h-12">
          <TabsTrigger 
            value="properties"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800"
          >
            Properties
          </TabsTrigger>
          <TabsTrigger 
            value="neighbors"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800"
          >
            Neighbors
          </TabsTrigger>
          <TabsTrigger 
            value="relationships"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800"
          >
            Relationships
          </TabsTrigger>
        </TabsList>

        {/* Properties Tab */}
        <TabsContent value="properties" className="m-0">
          <CardContent className="p-4 space-y-4">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Edit className="h-4 w-4" />
              Edit
            </Button>
            <div className="space-y-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {node.labels.join(', ')}
              </div>
              <div className="space-y-2">
                {Object.entries(node.properties).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-1">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{key}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Node ID</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{node.id}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </TabsContent>

        {/* Neighbors Tab */}
        <TabsContent value="neighbors" className="m-0">
          <div className="p-2 border-b flex items-center gap-2 bg-gray-50 dark:bg-gray-900">
            <Filter className="h-4 w-4 text-gray-500" />
            <div className="flex gap-2 overflow-x-auto">
              <Badge
                variant="outline"
                className={`cursor-pointer whitespace-nowrap ${
                  activeFilter === 'all' ? 'bg-gray-100 dark:bg-gray-800' : ''
                }`}
                onClick={() => setActiveFilter('all')}
              >
                All {neighbors?.length || 0}
              </Badge>
              {Object.entries(neighborTypes).map(([type, count]) => (
                <Badge
                  key={type}
                  variant="outline"
                  className={`cursor-pointer whitespace-nowrap ${
                    activeFilter === type ? 'bg-gray-100 dark:bg-gray-800' : ''
                  }`}
                  onClick={() => setActiveFilter(type)}
                >
                  {type} {count}
                </Badge>
              ))}
            </div>
          </div>
          <ScrollArea className="h-[400px]">
            {neighbors?.filter(n => activeFilter === 'all' || n.labels.includes(activeFilter))
              .map((neighbor, index) => (
                <div key={index} className="p-4 border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {neighbor.properties.name || neighbor.id}
                    </span>
                    <div className="flex gap-2">
                      {neighbor.labels.map(label => (
                        <Badge key={label} variant="outline">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {Object.entries(neighbor.properties).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-300">{key}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
            ))}
          </ScrollArea>
        </TabsContent>

        {/* Relationships Tab - Updated Design */}
        <TabsContent value="relationships" className="m-0">
          <div className="p-2 border-b flex items-center gap-2 bg-gray-50 dark:bg-gray-900">
            <Filter className="h-4 w-4 text-gray-500" />
            <div className="flex gap-2 overflow-x-auto">
              <Badge
                variant="outline"
                className={`cursor-pointer whitespace-nowrap ${
                  activeFilter === 'all' ? 'bg-gray-100 dark:bg-gray-800' : ''
                }`}
                onClick={() => setActiveFilter('all')}
              >
                All {relationships?.length || 0}
              </Badge>
              {Object.entries(relationshipTypes).map(([type, count]) => (
                <Badge
                  key={type}
                  variant="outline"
                  className={`cursor-pointer whitespace-nowrap ${
                    activeFilter === type ? 'bg-gray-100 dark:bg-gray-800' : ''
                  }`}
                  onClick={() => setActiveFilter(type)}
                >
                  {type} {count}
                </Badge>
              ))}
            </div>
          </div>
          <ScrollArea className="h-[400px]">
            {relationships?.filter(rel => activeFilter === 'all' || rel.type === activeFilter)
              .map((rel, index) => (
                <div key={index} className="p-4 border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 w-full">
                      <RelationshipNode 
                        label={rel.source === node.id ? node.labels[0] : "Person"}
                        name={rel.source === node.id ? node.properties.name : rel.source}
                      />
                      <RelationshipArrow type={rel.type} />
                      <RelationshipNode 
                        label={rel.target === node.id ? node.labels[0] : "Person"}
                        name={rel.target === node.id ? node.properties.name : rel.target}
                      />
                    </div>
                  </div>
                </div>
            ))}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  )
}

export default NodeDetailsSidebar