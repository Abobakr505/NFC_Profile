import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Lock, Mail } from 'lucide-react';

interface AuthLoginProps {
  onLogin: () => void;
  supabase: any;
}

const AuthLogin = ({ onLogin, supabase }: AuthLoginProps) => {
  // تحديد البريد الإلكتروني وكلمة السر المطلوبين
  const VALID_EMAIL = "admin@example.com";
  const VALID_PASSWORD = "SecurePassword123!";

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // التحقق من تطابق بيانات الاعتماد
    if (email !== VALID_EMAIL || password !== VALID_PASSWORD) {
      toast({
        title: "خطأ في تسجيل الدخول ❌",
        description: "بيانات الاعتماد غير صحيحة",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      toast({
        title: "تم تسجيل الدخول بنجاح! ✅",
        description: "مرحباً بك في لوحة التحكم"
      });
      onLogin();
    } catch (error: any) {
      toast({
        title: "خطأ في النظام ❌",
        description: error.message || "حدث خطأ أثناء عملية المصادقة",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800">
            تسجيل الدخول
          </CardTitle>
          <p className="text-gray-600">
            أدخل بياناتك للوصول إلى لوحة التحكم
          </p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ادخل بريدك الإلكتروني"
                  className="pr-10"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                  required
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              disabled={isLoading}
            >
              {isLoading ? "جاري التحقق..." : "تسجيل الدخول"}
            </Button>
          </form>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 font-medium mb-2">بيانات الدخول الثابتة:</p>
            <div className="text-xs text-blue-600 space-y-1">
              <p><span className="font-bold">البريد:</span> {VALID_EMAIL}</p>
              <p><span className="font-bold">كلمة السر:</span> {VALID_PASSWORD}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthLogin;