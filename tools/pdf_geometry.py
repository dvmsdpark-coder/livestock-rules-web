"""Map PDF top-origin coordinates to the visible CropBox rendered by PDFium."""
from math import floor,ceil

def render_box(page):
    media=page.bbox;crop=page.cropbox or media
    result=[max(media[0],crop[0]),max(media[1],crop[1]),min(media[2],crop[2]),min(media[3],crop[3])]
    if result[2]<=result[0] or result[3]<=result[1]:raise ValueError('Empty PDF rendering box')
    return result

def pixel_box(bounds,visible,width,height):
    x0,y0,x1,y1=visible;scale_x=width/(x1-x0);scale_y=height/(y1-y0)
    result=[max(0,floor((bounds[0]-x0)*scale_x)),max(0,floor((bounds[1]-y0)*scale_y)),min(width,ceil((bounds[2]-x0)*scale_x)),min(height,ceil((bounds[3]-y0)*scale_y))]
    if result[0]>=result[2] or result[1]>=result[3]:raise ValueError('Crop outside visible PDF page')
    return result
