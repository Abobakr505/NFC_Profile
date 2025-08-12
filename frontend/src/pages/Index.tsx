import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Nfc, User, Phone, Mail, MapPin, Globe, Linkedin, Twitter, Github, Edit3, QrCode, Share, LogOut, Camera, X } from 'lucide-react';
import { toast } from "@/hooks/use-toast";
import AuthLogin from '@/components/AuthLogin';
import { supabase } from '../lib/supabaseClient'; 
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode.react';


const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey: string = import.meta.env.VITE_SUPABASE_KEY;

const Index = () => {
  const [userProfile, setUserProfile] = useState({
    name: "",
    title: "",
    company: "",
    phone: "",
    email: "",
    location: "",
    website: "",
    linkedin: "",
    twitter: "",
    github: "",
    bio: "",
    profile_image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face"
  });

  const [showDashboard, setShowDashboard] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // states for card management
  const [cardToken, setCardToken] = useState('');
  const [pin, setPin] = useState('');
  const [channel, setChannel] = useState('email');
  const [customEmail, setCustomEmail] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [otp, setOtp] = useState('');

  // التحقق من دعم NFC
  useEffect(() => {
    if ('NDEFReader' in window) {
      setIsNfcSupported(true);
    }
  }, []);

  // جلب بيانات المستخدم من Supabase
  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setIsAuthenticated(true);
        
        // جلب بيانات الملف الشخصي من جدول profiles
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (error) {
          toast({
            title: "خطأ في جلب البيانات",
            description: error.message,
            variant: "destructive"
          });
        } else if (profile) {
          setUserProfile({
            name: profile.name || "",
            title: profile.title || "",
            company: profile.company || "",
            phone: profile.phone || "",
            email: profile.email || "",
            location: profile.location || "",
            website: profile.website || "",
            linkedin: profile.linkedin || "",
            twitter: profile.twitter || "",
            github: profile.github || "",
            bio: profile.bio || "",
            profile_image: profile.profile_image || ""
          });
        }
      }
      setIsLoading(false);
    };

    fetchUserProfile();
  }, [isAuthenticated]);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      toast({
        title: "خطأ في تسجيل الخروج",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setIsAuthenticated(false);
      setShowDashboard(false);
      toast({
        title: "تم تسجيل الخروج",
        description: "تم تسجيل خروجك بنجاح"
      });
    }
  };

  const handleNfcShare = async () => {
    if (isNfcSupported) {
      try {
        const ndef = new (window as any).NDEFReader();
        await ndef.write({
          records: [{
            recordType: "url",
            data: `${window.location.origin}?contact=${encodeURIComponent(JSON.stringify(userProfile))}`
          }]
        });
        
        toast({
          title: "تم بنجاح! 📱",
          description: "تم كتابة البيانات على بطاقة NFC"
        });
      } catch (error) {
        toast({
          title: "خطأ في NFC",
          description: "حدث خطأ أثناء كتابة البيانات",
          variant: "destructive"
        });
      }
    } else {
      setShowQrModal(true);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: userProfile.name,
          text: `تواصل مع ${userProfile.name} - ${userProfile.title}`,
          url: window.location.href
        });
      } catch (error) {
        console.log('خطأ في المشاركة:', error);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "تم النسخ! 📋",
        description: "تم نسخ الرابط إلى الحافظة"
      });
    }
  };

  // دالة لتحميل الصورة
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast({
        title: "خطأ في تحميل الصورة",
        description: "يجب تسجيل الدخول أولاً",
        variant: "destructive"
      });
      return;
    }
    
    setImageUploading(true);
    
    try {
      // توليد اسم فريد للصورة
      const fileName = `${uuidv4()}-${file.name}`;
      
      // تحميل الصورة إلى تخزين Supabase
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      // الحصول على رابط الصورة
      const { data: { publicUrl } } = supabase.storage
        .from('profile-images')
        .getPublicUrl(fileName);
      
      // تحديث حالة المستخدم بالصورة الجديدة
      setUserProfile(prev => ({ ...prev, profile_image: publicUrl }));
      
      // تحديث قاعدة البيانات بالصورة الجديدة
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_image: publicUrl })
        .eq('id', user.id);
      
      if (updateError) throw updateError;
      
      toast({
        title: "تم تحديث الصورة!",
        description: "تم تغيير صورة الملف الشخصي بنجاح"
      });
    } catch (error) {
      toast({
        title: "خطأ في تحميل الصورة",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setImageUploading(false);
    }
  };

  // حفظ التغييرات في Supabase
  const handleSaveChanges = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast({
        title: "خطأ في الحفظ",
        description: "يجب تسجيل الدخول أولاً",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        name: userProfile.name,
        title: userProfile.title,
        company: userProfile.company,
        phone: userProfile.phone,
        email: userProfile.email,
        location: userProfile.location,
        website: userProfile.website,
        linkedin: userProfile.linkedin,
        twitter: userProfile.twitter,
        github: userProfile.github,
        bio: userProfile.bio,
        profile_image: userProfile.profile_image
      });

    if (error) {
      toast({
        title: "خطأ في الحفظ",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "تم الحفظ! ✅",
        description: "تم حفظ جميع التغييرات بنجاح"
      });
    }
    setIsLoading(false);
  };

  const handleCreateCard = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('يجب تسجيل الدخول');
      
      const res = await fetch('http://localhost:8080/api/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_profile_id: user.id
        })
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      const data = await res.json();
      setCardToken(data.card_token);
      setPin(data.pin);
      
      toast({
        title: "تم إنشاء البطاقة!",
        description: `رمز البطاقة: ${data.card_token}\nPIN: ${data.pin}`
      });
    } catch (error) {
      toast({
        title: "خطأ في إنشاء البطاقة",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleRequestOTP = async () => {
    try {
      const body = {
        card_token: cardToken,
        pin,
        channel
      };
      if (channel === 'email' && customEmail) body.email = customEmail;
      if (channel === 'sms' && customPhone) body.phone = customPhone;
      
      const res = await fetch('http://localhost:8080/api/cards/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      toast({
        title: "تم!",
        description: "تم إرسال رمز التحقق"
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleVerifyOTP = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/cards/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_token: cardToken,
          otp
        })
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      toast({
        title: "تم!",
        description: "تم تفعيل البطاقة"
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // إذا كان التطبيق في حالة تحميل
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  // إذا لم يتم تسجيل الدخول وعرض لوحة التحكم
  if (!isAuthenticated && showDashboard) {
    return <AuthLogin onLogin={handleLogin} supabase={supabase} />;
  }

  if (showDashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800">لوحة التحكم</h1>
            <div className="flex gap-3">
              <Button 
                onClick={() => setShowDashboard(false)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                عرض البطاقة
              </Button>
              <Button 
                onClick={handleLogout}
                variant="outline"
                className="flex items-center gap-2 text-red-600 hover:text-red-700"
              >
                <LogOut className="w-4 h-4" />
                تسجيل الخروج
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5" />
                  المعلومات الأساسية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">صورة الملف الشخصي</label>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative">
                      <img
                        src={userProfile.profile_image}
                        alt="Profile"
                        className="w-16 h-16 rounded-full object-cover border-2 border-blue-200"
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-1"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">انقر على الأيقونة لتغيير الصورة</p>
                      {imageUploading && (
                        <div className="flex items-center mt-1">
                          <div className="w-4 h-4 border-t-2 border-blue-500 rounded-full animate-spin mr-2"></div>
                          <span className="text-xs text-gray-600">جاري التحميل...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">الاسم</label>
                  <input
                    type="text"
                    value={userProfile.name}
                    onChange={(e) => setUserProfile({...userProfile, name: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">المسمى الوظيفي</label>
                  <input
                    type="text"
                    value={userProfile.title}
                    onChange={(e) => setUserProfile({...userProfile, title: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">الشركة</label>
                  <input
                    type="text"
                    value={userProfile.company}
                    onChange={(e) => setUserProfile({...userProfile, company: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">نبذة تعريفية</label>
                  <textarea
                    value={userProfile.bio}
                    onChange={(e) => setUserProfile({...userProfile, bio: e.target.value})}
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="w-5 h-5" />
                  معلومات الاتصال
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={userProfile.phone}
                    onChange={(e) => setUserProfile({...userProfile, phone: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={userProfile.email}
                    onChange={(e) => setUserProfile({...userProfile, email: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">الموقع</label>
                  <input
                    type="text"
                    value={userProfile.location}
                    onChange={(e) => setUserProfile({...userProfile, location: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">الموقع الإلكتروني</label>
                  <input
                    type="url"
                    value={userProfile.website}
                    onChange={(e) => setUserProfile({...userProfile, website: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  وسائل التواصل الاجتماعي
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">LinkedIn</label>
                  <input
                    type="url"
                    value={userProfile.linkedin}
                    onChange={(e) => setUserProfile({...userProfile, linkedin: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Twitter</label>
                  <input
                    type="url"
                    value={userProfile.twitter}
                    onChange={(e) => setUserProfile({...userProfile, twitter: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">GitHub</label>
                  <input
                    type="url"
                    value={userProfile.github}
                    onChange={(e) => setUserProfile({...userProfile, github: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Nfc className="w-5 h-5" />
                  إدارة البطاقة الذكية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Button 
                    onClick={handleCreateCard}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    إنشاء بطاقة جديدة
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">رمز البطاقة (Card Token)</label>
                    <input
                      type="text"
                      value={cardToken}
                      onChange={(e) => setCardToken(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">PIN</label>
                    <input
                      type="text"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">قناة الإرسال</label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="email">بريد إلكتروني</option>
                      <option value="sms">رسالة نصية</option>
                    </select>
                  </div>
                  {channel === 'email' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">بريد إلكتروني (اختياري)</label>
                      <input
                        type="email"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}
                  {channel === 'sms' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">رقم الهاتف (اختياري)</label>
                      <input
                        type="tel"
                        value={customPhone}
                        onChange={(e) => setCustomPhone(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}
                  <Button 
                    onClick={handleRequestOTP}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    طلب رمز التحقق
                  </Button>
                </div>

                <hr className="my-4" />

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">رمز التحقق (OTP)</label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <Button 
                    onClick={handleVerifyOTP}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    التحقق وتفعيل البطاقة
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 flex justify-center">
            <Button 
              onClick={handleSaveChanges}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-md mx-auto">
        {/* Header Actions */}
        <div className="flex justify-between items-center mb-6">
          <Button
            onClick={() => setShowDashboard(true)}
            variant="outline"
            className="flex items-center gap-2 bg-white/80 backdrop-blur-sm"
            disabled={isLoading}
          >
            <Edit3 className="w-4 h-4" />
            تعديل
          </Button>
          
          <div className="flex gap-2">
            <Button
              onClick={handleShare}
              variant="outline"
              size="sm"
              className="bg-white/80 backdrop-blur-sm"
              disabled={isLoading}
            >
              <Share className="w-4 h-4" />
            </Button>
            <Button
              onClick={handleNfcShare}
              variant="outline"
              size="sm"
              className="bg-white/80 backdrop-blur-sm"
              disabled={isLoading}
            >
              <QrCode className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Business Card */}
        <Card className="relative overflow-hidden shadow-2xl bg-gradient-to-br from-white to-blue-50/50 border-0 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-indigo-500/10 to-cyan-500/10 rounded-full translate-y-12 -translate-x-12"></div>
          
          <CardContent className="p-8 relative z-10">
            {/* Profile Section */}
            <div className="text-center mb-6">
              <div className="relative inline-block mb-4">
                <img
                  src={userProfile.profile_image}
                  alt={userProfile.name}
                  className="w-24 h-24 rounded-full mx-auto border-4 border-white shadow-lg object-cover"
                />
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-green-400 to-green-500 rounded-full p-2 border-2 border-white">
                  <Nfc className="w-4 h-4 text-white" />
                </div>
              </div>
              
              <h1 className="text-2xl font-bold text-gray-800 mb-1">{userProfile.name || "الاسم"}</h1>
              <p className="text-blue-600 font-semibold mb-2">{userProfile.title || "المسمى الوظيفي"}</p>
              {userProfile.company && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
                  {userProfile.company}
                </Badge>
              )}
            </div>

            {/* Bio */}
            {userProfile.bio && (
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <p className="text-gray-700 text-sm leading-relaxed text-center">
                  {userProfile.bio}
                </p>
              </div>
            )}

            {/* Contact Info */}
            <div className="space-y-3 mb-6">
              {userProfile.phone && (
                <a 
                  href={`tel:${userProfile.phone}`}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 group border border-gray-100"
                >
                  <div className="bg-gradient-to-r from-green-500 to-green-600 p-2 rounded-lg group-hover:scale-110 transition-transform">
                    <Phone className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-gray-700 font-medium">{userProfile.phone}</span>
                </a>
              )}

              {userProfile.email && (
                <a 
                  href={`mailto:${userProfile.email}`}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 group border border-gray-100"
                >
                  <div className="bg-gradient-to-r from-red-500 to-red-600 p-2 rounded-lg group-hover:scale-110 transition-transform">
                    <Mail className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-gray-700 font-medium">{userProfile.email}</span>
                </a>
              )}

              {userProfile.location && (
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-2 rounded-lg">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-gray-700 font-medium">{userProfile.location}</span>
                </div>
              )}
            </div>

            {/* Social Links */}
            <div className="flex justify-center gap-4">
              {userProfile.website && (
                <a 
                  href={userProfile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-gray-600 to-gray-700 p-3 rounded-full shadow-lg hover:scale-110 transition-all duration-200"
                >
                  <Globe className="w-5 h-5 text-white" />
                </a>
              )}
              {userProfile.linkedin && (
                <a 
                  href={userProfile.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-blue-600 to-blue-700 p-3 rounded-full shadow-lg hover:scale-110 transition-all duration-200"
                >
                  <Linkedin className="w-5 h-5 text-white" />
                </a>
              )}
              {userProfile.twitter && (
                <a 
                  href={userProfile.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-sky-500 to-sky-600 p-3 rounded-full shadow-lg hover:scale-110 transition-all duration-200"
                >
                  <Twitter className="w-5 h-5 text-white" />
                </a>
              )}
              {userProfile.github && (
                <a 
                  href={userProfile.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-gray-800 to-gray-900 p-3 rounded-full shadow-lg hover:scale-110 transition-all duration-200"
                >
                  <Github className="w-5 h-5 text-white" />
                </a>
              )}
            </div>

            {/* NFC Action */}
            <div className="mt-6 text-center">
              <Button
                onClick={handleNfcShare}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
                disabled={isLoading}
              >
                <Nfc className="w-5 h-5 mr-2" />
                {isNfcSupported ? "كتابة على بطاقة NFC" : "مشاركة البطاقة"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            بطاقة تعريفية ذكية • {new Date().getFullYear()}
          </p>
        </div>
              <footer className="bg-teeverse-dark text-gray-500 pb-8 mt-auto">
        <div className=" flex items-center justify-center flex-col   pt-2 text-center md:text-right">
            <p className="font-bold text-sm text-gray-500 mt-2 transition-transform hover:scale-95">
              تصميم و تطوير بكل ❤️ من{" "}
              <a
                href="https://tawrr.com/"
                target="_blank"
                className=" p-[0.30rem] rounded-lg  mr-2"
              >
                <img
                  src="https://yasuruha.netlify.app/logoy.webp"
                  alt=""
                  className="h-12 w-12 inline-block transition-transform scale-150"
                />
              </a>
            </p>
          </div>
      </footer>
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">مشاركة البطاقة التعريفية</h3>
                <button 
                  onClick={() => setShowQrModal(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="text-center">
                <div className="bg-white p-4 rounded-lg inline-block">
                  <QRCode 
                    value={`${window.location.origin}?contact=${encodeURIComponent(JSON.stringify(userProfile))}`}
                    level="L"
                    size={300}
                    includeMargin={true}
                    fgColor="#1e3a8a"
                    bgColor="#ffffff"
                  />
                </div>
                
                <p className="mt-4 text-gray-600">
                  مسح رمز الاستجابة السريعة لمشاركة بطاقتك التعريفية
                </p>
                
                <div className="mt-6 flex justify-center gap-2">
                  <Button 
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      toast({
                        title: "تم النسخ!",
                        description: "تم نسخ رابط البطاقة إلى الحافظة"
                      });
                    }}
                    variant="outline"
                    className="mr-2"
                  >
                    نسخ الرابط
                  </Button>
                  
                  <Button 
                    onClick={handleShare}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    مشاركة
                  </Button>
                </div>
              </div>
              
              <div className="mt-8 border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-2">كيفية استخدام البطاقة:</h4>
                <ol className="list-decimal list-inside text-gray-600 space-y-1 text-sm">
                  <li>قم بتسجيل الدخول وإنشاء حسابك</li>
                  <li>املأ معلوماتك الشخصية والمهنية</li>
                  <li>شارك بطاقتك عبر رمز الاستجابة السريعة أو NFC</li>
                  <li>عند مسح الرمز، سيتم فتح بطاقتك التعريفية مباشرة</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;