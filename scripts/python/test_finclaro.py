import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
options = Options()
options.add_argument('--headless=new')
driver = webdriver.Chrome(options=options)
driver.get('https://finclaro.cl/indicadores')
import time
time.sleep(3)
html = driver.page_source
driver.quit()
soup = BeautifulSoup(html, 'html.parser')
for h3 in soup.find_all('h3'):
    card = h3.parent.parent if h3.parent else None
    if card:
        print(f'H3: {h3.text}, Card classes: {card.get("class")}')
