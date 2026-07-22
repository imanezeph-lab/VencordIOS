ARCHS = arm64 arm64e
TARGET := iphone:clang:latest:14.0

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = VencordIOS

VencordIOS_FILES = Tweak.x
VencordIOS_CFLAGS = -fobjc-arc -Wno-unused-variable
VencordIOS_FRAMEWORKS = UIKit JavaScriptCore Foundation

include $(THEOS_MAKE_PATH)/tweak.mk
